// src/components/pointage/ModalPointage.tsx
//
// Pointage d'arrivée et de départ, par QR ou par reconnaissance
// faciale.
//
// ── Ce que chaque méthode prouve ────────────────────────────────────
//
// Les deux voies ne prouvent pas la même chose, et c'est le cœur de la
// comparaison :
//
//   QR + géolocalisation  → atteste le LIEU. Le code est affiché à
//                           l'entrée ; la position confirme qu'on y
//                           est. N'atteste pas QUI pointe : un code
//                           photographié se partage.
//
//   Visage + géolocalisation → atteste l'IDENTITÉ. N'atteste pas le
//                           lieu par lui-même, d'où la géolocalisation
//                           exigée dans les deux cas.
//
// La reconnaissance faciale remplace donc le QR, jamais la
// géolocalisation. C'est la réponse à « pourquoi garder les deux ? » :
// chacune couvre un angle de fraude que l'autre laisse ouvert.
//
// ── Mesure ──────────────────────────────────────────────────────────
//
// La durée du geste est mesurée du clic d'ouverture jusqu'à l'envoi,
// et transmise au serveur. Sans elle, la comparaison entre les deux
// méthodes resterait une impression ; avec elle, le rapport peut citer
// des médianes relevées sur de vrais pointages.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, X, CheckCircle2, AlertTriangle, Navigation, QrCode, ScanFace,
  LogIn, LogOut, ChevronRight, Eye, Loader2,
} from 'lucide-react';
import {
  chargerModeles, analyserVivacite, analyserPlusieurs, ouvrirCamera,
  fermerCamera, detecteurClignement, PROPORTION_MIN, VIVACITE_EXIGEE,
} from '../../lib/visage';
import Chronometre from './Chronometre';
import { pointagesService } from '../../services/pointages';

const ACCENT = '#4F46E5';

// Au-delà, la position est trop floue pour attester un lieu. Le
// pointage reste possible, mais il est signalé.
const PRECISION_DOUTEUSE_M = 100;

/**
 * Message d'erreur tel que le serveur l'a formulé.
 *
 * L'API de ce projet renvoie ses erreurs sous la clé `erreur` ; axios
 * expose aussi `message`. Lire une seule des deux fait tomber dans le
 * texte de repli — et un « réessayez » générique cache la vraie
 * raison, qui est souvent précise et actionnable : notice périmée,
 * apparence redondante, maximum atteint.
 */
function messageErreur(e: any, repli: string): string {
  return e?.response?.data?.erreur
    ?? e?.response?.data?.message
    ?? e?.erreur
    ?? (typeof e?.message === 'string' && !e.message.startsWith('Request failed')
      ? e.message
      : null)
    ?? repli;
}

type Methode = 'QR' | 'FACIAL';

interface Position {
  latitude: number;
  longitude: number;
  precision: number;
}

export default function ModalPointage({
  depart, facialDisponible, onClose, onSuccess,
}: {
  depart: boolean;
  /** Vrai si le salarié a enrôlé son visage — lu depuis GET /biometrie/etat */
  facialDisponible: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  // Un salarié non enrôlé n'a pas de choix à faire : lui présenter
  // deux options dont une impossible est une impasse déguisée.
  const [methode, setMethode] = useState<Methode | null>(
    facialDisponible ? null : 'QR',
  );

  const [position, setPosition] = useState<Position | null>(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [horloge, setHorloge] = useState(new Date());

  // Départ de la mesure : l'ouverture du modal, pas le moment où la
  // caméra est prête. Compter depuis la caméra effacerait justement le
  // temps de chargement du modèle, principal coût de la voie faciale.
  const debut = useRef(Date.now());

  // Un seul envoi par ouverture du modal, quoi qu'il arrive en dessous.
  //
  // EtapeVisage avait déjà sa garde, mais un ref ne survit pas au
  // démontage de son composant : il suffit que l'étape soit remontée —
  // changement de méthode, bascule de « pret » pendant l'envoi — pour
  // que la garde reparte à zéro. Trois POST sont ainsi partis d'un
  // seul geste, et le modal a affiché la dernière réponse arrivée,
  // pas la vraie cause. La garde appartient donc au parent : c'est son
  // cycle de vie, et non celui de l'étape, qui définit « un pointage ».
  //
  // Un ref plutôt que l'état « envoi » : setEnvoi ne devient visible
  // qu'au rendu suivant, donc deux appels dans le même tick passeraient
  // tous les deux. Un ref change tout de suite.
  const enVol = useRef(false);

  // L'heure affichée est celle du poste ; c'est le serveur qui
  // horodate réellement le pointage. L'écart serait exploitable
  // autrement.
  useEffect(() => {
    const t = setInterval(() => setHorloge(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Position, demandée pour les deux méthodes ────────────────────

  useEffect(() => {
    if (!navigator.geolocation) {
      setErreur('Votre navigateur ne permet pas la géolocalisation.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (p) => setPosition({
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        precision: Math.round(p.coords.accuracy),
      }),
      (e) => setErreur(
        e.code === e.PERMISSION_DENIED
          ? 'Autorisez la localisation : elle atteste de votre présence sur site.'
          : "Position indisponible. Placez-vous près d'une fenêtre et réessayez.",
      ),
      // enableHighAccuracy force le GPS plutôt que le réseau : sans
      // lui, la précision dépasse souvent le rayon du site.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  // ── Envoi ────────────────────────────────────────────────────────

  const envoyer = useCallback(async (
    charge: { siteCode?: string | null; descripteur?: number[][] },
  ) => {
    if (!position) return;
    if (enVol.current) return;
    enVol.current = true;

    setEnvoi(true);
    setErreur('');

    try {
      const corps = {
        latitude: position.latitude,
        longitude: position.longitude,
        precisionMetres: position.precision,
        siteCode: charge.siteCode ?? null,
        methode: charge.descripteur ? 'FACIAL' : 'QR',
        descripteur: charge.descripteur,
        dureeMs: Date.now() - debut.current,
      };

      if (depart) await pointagesService.depart(corps as any);
      else await pointagesService.arrivee(corps as any);

      onSuccess(depart ? 'Départ enregistré' : 'Arrivée enregistrée');
      onClose();
    } catch (e: any) {
      setErreur(messageErreur(e, 'Pointage refusé'));
      setEnvoi(false);
      // On relâche la garde : l'erreur est rattrapable — visage mal
      // cadré, position imprécise — et un modal définitivement muet
      // après un seul refus serait pire que le doublon qu'on évite.
      // En cas de succès on ne relâche pas : le modal se ferme.
      enVol.current = false;
    }
  }, [position, depart, onClose, onSuccess]);

  // ── Rendu ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-60 p-0 sm:p-4">
      <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">

        {/* En-tête */}
        <div className="flex items-center justify-between p-5 border-b border-stone-200 sticky top-0 bg-surface rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              depart ? 'bg-red-50' : 'bg-brand-500/10'
            }`}>
              {depart
                ? <LogOut className="w-5 h-5 text-red-500" />
                : <LogIn className="w-5 h-5 text-brand-texte" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base sm:text-lg text-stone-800">
                {depart ? 'Enregistrer le départ' : "Enregistrer l'arrivée"}
              </h2>
              <p className="text-xs text-stone-500 tabular-nums">
                {horloge.toLocaleTimeString('fr-FR')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{erreur}</span>
            </div>
          )}

          {/* Position : affichée avec sa précision, car c'est elle qui
              décidera du signalement côté serveur. */}
          <div className={`flex items-center gap-3 rounded-xl p-3 ${
            position ? 'bg-brand-500/10' : 'bg-stone-50'
          }`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              position ? 'bg-brand-500' : 'bg-stone-200'
            }`}>
              <Navigation className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-stone-800">
                {position ? 'Position obtenue' : 'Localisation en cours…'}
              </div>
              <div className="text-[10px] text-stone-500 truncate">
                {position
                  ? `Précision ${position.precision} m · ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`
                  : "Autorisez l’accès à votre position"}
              </div>
            </div>
            {position && <CheckCircle2 className="w-4 h-4 text-brand-texte shrink-0" />}
          </div>

          {/* Une précision médiocre est dite avec son chiffre :
              « position imprécise » ne fait pas comprendre qu'il faut
              sortir du sous-sol. */}
          {position && position.precision > PRECISION_DOUTEUSE_M && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">
                Précision de {position.precision} m, trop imprécise pour une
                vérification fiable. Sortez du bâtiment ou approchez-vous
                d'une fenêtre.
              </span>
            </div>
          )}

          {/* Choix de la méthode */}
          {methode === null && (
            <div className="space-y-2.5">
              <p className="text-xs text-stone-500">
                Comment souhaitez-vous attester votre présence ?
              </p>

              <ChoixMethode
                icone={ScanFace}
                titre="Reconnaissance faciale"
                detail="Quelques secondes, sans rien chercher"
                surClic={() => setMethode('FACIAL')}
              />
              <ChoixMethode
                icone={QrCode}
                titre="QR et géolocalisation"
                detail="Visez le code affiché à l'entrée"
                surClic={() => setMethode('QR')}
              />
            </div>
          )}

          {methode === 'QR' && (
            <EtapeQr
              depart={depart}
              pret={Boolean(position) && !envoi}
              envoi={envoi}
              surEnvoi={(siteCode) => envoyer({ siteCode })}
              surAnnuler={onClose}
              surChanger={facialDisponible ? () => setMethode(null) : undefined}
            />
          )}

          {methode === 'FACIAL' && (
            <EtapeVisage
              pret={Boolean(position) && !envoi}
              envoi={envoi}
              surDescripteur={(d) => envoyer({ descripteur: d })}
              surChanger={() => setMethode('QR')}
              surErreur={(m) => { setErreur(m); setMethode('QR'); }}
            />
          )}

          {/* L'enrôlement est proposé, jamais imposé — et la mention
              reste factuelle : « plus rapide », pas « plus sûr ». */}
          {!facialDisponible && methode === 'QR' && (
            <Link
              to="/employe/reconnaissance-faciale"
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-stone-50 border border-stone-100 hover:border-brand-500 transition-colors"
            >
              <ScanFace className="w-4 h-4 shrink-0 text-stone-400" />
              <span className="text-[11px] text-stone-600 leading-relaxed min-w-0">
                Vous pouvez activer le pointage par reconnaissance faciale,
                plus rapide. Facultatif, et révocable à tout moment.
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-stone-300" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ChoixMethode({ icone: Icone, titre, detail, surClic }: {
  icone: React.ComponentType<{ className?: string }>;
  titre: string;
  detail: string;
  surClic: () => void;
}) {
  return (
    <button
      onClick={surClic}
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-stone-200 hover:border-brand-500 hover:bg-stone-50 transition-colors text-start"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${ACCENT}1a` }}
      >
        <Icone className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-stone-800">{titre}</div>
        <div className="text-[10px] text-stone-400 leading-relaxed">{detail}</div>
      </div>
      <ChevronRight className="w-4 h-4 ms-auto shrink-0 text-stone-300" />
    </button>
  );
}

// ── QR ──────────────────────────────────────────────────────────────

function EtapeQr({ depart, pret, envoi, surEnvoi, surAnnuler, surChanger }: {
  depart: boolean;
  pret: boolean;
  envoi: boolean;
  surEnvoi: (siteCode: string | null) => void;
  surAnnuler: () => void;
  surChanger?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const boucle = useRef<number | null>(null);

  const [siteScanne, setSiteScanne] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const arreter = useCallback(() => {
    if (boucle.current) cancelAnimationFrame(boucle.current);
    flux.current?.getTracks().forEach((t) => t.stop());
    flux.current = null;
  }, []);

  useEffect(() => arreter, [arreter]);

  useEffect(() => {
    if (siteScanne) return;

    let annule = false;

    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          // Caméra arrière : sur mobile, c'est elle qui vise le QR
          // affiché au mur.
          video: { facingMode: 'environment' },
        });

        if (annule) { s.getTracks().forEach((t) => t.stop()); return; }

        flux.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }

        const jsQR = (await import('jsqr')).default;

        const lire = () => {
          const v = video.current;
          const c = toile.current;

          if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) {
            boucle.current = requestAnimationFrame(lire);
            return;
          }

          c.width = v.videoWidth;
          c.height = v.videoHeight;

          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          ctx.drawImage(v, 0, 0, c.width, c.height);
          const image = ctx.getImageData(0, 0, c.width, c.height);
          const code = jsQR(image.data, image.width, image.height);

          if (code?.data) {
            setSiteScanne(code.data);
            arreter();
            return;
          }

          boucle.current = requestAnimationFrame(lire);
        };

        lire();
      } catch {
        if (!annule) {
          setMessage('Caméra inaccessible. Autorisez-la, ou pointez sans scanner.');
        }
      }
    })();

    return () => { annule = true; };
  }, [siteScanne, arreter]);

  return (
    <div className="space-y-4">
      {message && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="leading-relaxed">{message}</span>
        </div>
      )}

      {!siteScanne ? (
        <div className="relative rounded-2xl overflow-hidden bg-stone-900 aspect-square">
          <video ref={video} playsInline muted className="w-full h-full object-cover" />
          <canvas ref={toile} className="hidden" />

          {/* Cadre de visée : sans repère, on ne sait pas où présenter
              le code. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-40 sm:w-48 aspect-square border-2 border-white/80 rounded-2xl" />
          </div>

          <div className="absolute bottom-3 start-0 end-0 text-center px-4">
            <span className="text-[11px] font-bold text-white bg-black/50 px-3 py-1.5 rounded-full">
              Visez le QR affiché à l'entrée
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl p-3 bg-brand-500/10">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-stone-800">Site reconnu</div>
            <div className="text-[10px] text-stone-500 truncate font-mono">
              {siteScanne}
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-brand-texte shrink-0" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2.5">
        <button
          onClick={surAnnuler}
          className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={() => { arreter(); surEnvoi(siteScanne); }}
          disabled={!pret}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-colors ${
            depart ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-500 hover:bg-brand-600'
          }`}
        >
          {envoi
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Clock className="w-4 h-4" />}
          {envoi ? 'Enregistrement…' : 'Confirmer'}
        </button>
      </div>

      {surChanger && (
        <button
          onClick={() => { arreter(); surChanger(); }}
          className="w-full flex items-center justify-center gap-2 text-xs font-medium text-stone-500 hover:text-brand-texte transition-colors"
        >
          <ScanFace className="w-3.5 h-3.5" />
          Changer de méthode
        </button>
      )}

      {/* Sans QR, le pointage reste possible mais signalé : interdire
          bloquerait un salarié sur un site sans affichage. */}
      {!siteScanne && pret && (
        <p className="text-[10px] text-stone-400 text-center leading-relaxed">
          Sans scan du QR, le pointage est enregistré avec votre position seule
          et signalé pour vérification.
        </p>
      )}
    </div>
  );
}

// ── Visage ──────────────────────────────────────────────────────────

function EtapeVisage({ pret, envoi, surDescripteur, surChanger, surErreur }: {
  pret: boolean;
  envoi: boolean;
  surDescripteur: (d: number[][]) => void;
  surChanger: () => void;
  surErreur: (m: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const boucle = useRef<number | null>(null);
  const clignement = useRef(detecteurClignement());
  const envoye = useRef(false);

  const [phase, setPhase] = useState<'chargement' | 'analyse'>('chargement');
  const [message, setMessage] = useState('Chargement du modèle…');
  const [vivaciteOk, setVivaciteOk] = useState(false);

  // Mesures affichées à l'écran. Un test de vivacité qui échoue sans
  // rien montrer est indébogable : ni le salarié ni la RH ne peuvent
  // dire si le visage est trop loin, trop sombre, ou si le clignement
  // n'a pas été vu.
  const [mesure, setMesure] = useState<{ ouverture: number; reference: number } | null>(null);

  // Au bout de ce délai sans clignement constaté, on propose le QR.
  // Un écran qui tourne indéfiniment est le pire des deux mondes :
  // le salarié ne pointe pas et ne sait pas pourquoi.
  const [bloque, setBloque] = useState(false);

  useEffect(() => {
    let vivant = true;

    (async () => {
      try {
        // Le modèle d'abord : ouvrir la caméra pour faire ensuite
        // patienter devant son propre reflet est désagréable.
        await chargerModeles();
        if (!vivant) return;

        setMessage('Ouverture de la caméra…');
        const s = await ouvrirCamera();
        if (!vivant) { fermerCamera(s); return; }

        flux.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }

        setPhase('analyse');
        setMessage(VIVACITE_EXIGEE
          ? "Regardez l'objectif et clignez des yeux"
          : "Regardez l'objectif");
      } catch (e: any) {
        // Le repli sur le QR est automatique : une caméra refusée ne
        // doit pas empêcher de pointer.
        if (vivant) surErreur(e?.message ?? "La caméra n'a pas pu être ouverte.");
      }
    })();

    return () => {
      vivant = false;
      if (boucle.current) window.clearTimeout(boucle.current);
      fermerCamera(flux.current);
      flux.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'analyse' || !pret) return;

    let vivant = true;

    // Le compteur part au début de l'analyse, pas au montage : le
    // chargement du modèle ne doit pas manger le délai accordé au
    // salarié pour cligner.
    const debutAnalyse = Date.now();

    const tour = async () => {
      if (!vivant || !video.current || video.current.readyState < 2) {
        if (vivant) boucle.current = window.setTimeout(tour, 200);
        return;
      }

      // ── Phase 1 : vivacité ──
      //
      // Analyse légère, sans descripteur. Le calcul du descripteur
      // coûte 150 à 300 ms et ferait manquer le clignement, qui dure
      // 100 à 150 ms. La vivacité est exigée à chaque pointage, pas
      // seulement à l'enrôlement : sans elle, une photographie
      // suffirait tous les matins.
      if (VIVACITE_EXIGEE && !clignement.current.valide) {
        const leger = await analyserVivacite(video.current).catch(() => null);
        if (!vivant) return;

        if (!leger) {
          setMessage('Aucun visage détecté — rapprochez-vous');
          setMesure(null);
          boucle.current = window.setTimeout(tour, 150);
          return;
        }

        clignement.current.observer(leger.ouvertureYeux);
        setMesure({
          ouverture: leger.ouvertureYeux,
          reference: clignement.current.reference,
        });

        if (clignement.current.valide) {
          setVivaciteOk(true);
          setMessage('Vivacité confirmée — vérification…');
        } else if (clignement.current.phase === 'calibrage') {
          setMessage('Gardez les yeux ouverts un instant…');
        } else {
          setMessage('Clignez des yeux');
        }

        if (Date.now() - debutAnalyse > 15000) setBloque(true);

        // Aucune attente ajoutée : l'analyse légère prend déjà
        // quelques dizaines de millisecondes, et chaque pause
        // supplémentaire augmente le risque de rater le clignement.
        boucle.current = window.setTimeout(tour, 0);
        return;
      }

      // ── Phase 2 : descripteurs ──
      //
      // La vivacité est acquise, le calcul complet peut être payé. On
      // prend trois mesures cohérentes plutôt qu'une : le serveur
      // décidera sur leur médiane, ce qui écarte la prise malheureuse
      // dans les deux sens — refus injustifié comme rapprochement
      // fortuit.
      // Cadrage d'abord, avec l'analyse légère : lancer la collecte
      // des descripteurs sur un visage trop éloigné la fait échouer
      // douze fois de suite avant d'abandonner, ce qui se ressent
      // comme un blocage.
      const cadre = await analyserVivacite(video.current).catch(() => null);
      if (!vivant) return;

      if (!cadre) {
        setMessage('Placez-vous face à la caméra');
        boucle.current = window.setTimeout(tour, 120);
        return;
      }

      if (cadre.proportion < PROPORTION_MIN) {
        setMessage(
          `Rapprochez-vous — visage à ${Math.round(cadre.proportion * 100)} % `
          + `du cadre, il en faut ${Math.round(PROPORTION_MIN * 100)} %`,
        );
        boucle.current = window.setTimeout(tour, 120);
        return;
      }

      setMessage('Ne bougez plus…');

      // Deux prises plutôt que trois : la médiane de deux vaut leur
      // moyenne, ce qui absorbe encore le bruit d'une mesure isolée,
      // et retire un calcul de descripteur du chemin critique.
      const lot = await analyserPlusieurs(video.current, 2).catch(() => null);
      if (!vivant) return;

      if (!lot) {
        setMessage('Gardez le visage immobile');
        boucle.current = window.setTimeout(tour, 150);
        return;
      }

      if (!envoye.current) {
        envoye.current = true;
        fermerCamera(flux.current);
        flux.current = null;
        // Le descripteur part au serveur, qui refait la comparaison.
        // Le navigateur ne rend aucun verdict.
        surDescripteur(lot);
      }
    };

    tour();

    return () => {
      vivant = false;
      if (boucle.current) window.clearTimeout(boucle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pret]);

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-stone-900 aspect-4/3">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
          // Miroir : se recentrer sans lui demande d'inverser
          // mentalement ses gestes.
          style={{ transform: 'scaleX(-1)' }}
        />

        <div
          className={`absolute inset-0 m-auto w-[55%] aspect-3/4 rounded-[50%] border-2 transition-colors ${
            vivaciteOk ? 'border-green-400/80' : 'border-white/40'
          }`}
          style={{ marginTop: '8%' }}
        />

        {(phase === 'chargement' || !pret || envoi) && (
          <div className="absolute inset-0 bg-stone-900/80 flex flex-col items-center justify-center gap-2.5 px-6">
            <Loader2 className="w-5 h-5 text-white/60 animate-spin" />
            <p className="text-xs text-white/60 text-center">
              {envoi ? 'Vérification…'
                : !pret ? 'En attente de la position'
                : message}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-start justify-center gap-2">
        {!vivaciteOk && <Eye className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />}
        <p className="text-sm text-stone-600 text-center">{message}</p>
      </div>

      {/* Mesures en clair. Ce que la caméra voit doit être lisible :
          sinon un échec de vivacité ne se distingue pas d'un bogue. */}
      {mesure && (
        <p className="text-[10px] text-stone-400 text-center font-mono">
          ouverture {mesure.ouverture.toFixed(3)}
          {mesure.reference > 0 && ` · référence ${mesure.reference.toFixed(3)}`}
          {mesure.reference > 0 && ` · seuil ${(mesure.reference * 0.72).toFixed(3)}`}
        </p>
      )}

      {/* Durées mesurées, et avertissement si le calcul n'est pas
          accéléré — y compris dans le cas trompeur d'un WebGL émulé
          en logiciel, qui se présente comme accéléré. */}
      <Chronometre />

      {/* Sortie de secours. Le clignement peut ne pas être vu —
          lunettes réfléchissantes, contre-jour, caméra de faible
          résolution — et le pointage ne doit jamais devenir
          impossible pour autant. */}
      {bloque && !vivaciteOk && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="leading-relaxed">
            Le clignement n'est pas détecté. Essayez en vous rapprochant, face
            à la lumière, ou pointez par QR — vous aurez exactement les mêmes
            droits.
          </span>
        </div>
      )}

      <p className="text-[10px] text-stone-400 text-center leading-relaxed">
        L'image ne quitte pas votre appareil. Seuls les 128 nombres calculés
        par votre navigateur sont transmis.
      </p>

      <button
        onClick={surChanger}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
      >
        <QrCode className="w-4 h-4" />
        Utiliser le QR à la place
      </button>
    </div>
  );
}
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/LoginPage';
import AdminDashboard from './pages/admin/DashboardPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import InvoicingPage from './pages/admin/InvoicingPage';
import TimeTrackingPage from './pages/admin/TimeTrackingPage';
import RecruitmentPage from './pages/admin/RecruitmentPage';
import ReportsPage from './pages/admin/ReportsPage';
import MesCandidaturesPage from './pages/candidate/MesCandidaturesPage';
import JobsPage from './pages/candidate/JobsPage';
import RegisterCandidatPage from './pages/candidate/RegisterCandidatPage';
import CalendarPage from './pages/admin/CalendarPage';
import EmployeeProfilePage from './pages/employee/EmployeeProfile';
import CandidatProfilePage from './pages/candidate/CandidatProfilePage';
import EmployeeDashboard from './pages/employee/EmplDash';
import QuizPage from './pages/candidate/QuizPage';
import PipelinePage from './pages/admin/PipelinePage';
import AssessmentsPage from './pages/candidate/AssessmentsPage';
import PayrollManagementPage from './pages/employee/PayrollManagementPage';
import HistoriquePointagePage from './pages/employee/HistoriquePointagePage';
import MesFacturesPage from './pages/employee/MesFacturesPage';
import CongesAdminPage from './pages/admin/CongesAdminPage';
import CandidaturesPage from './pages/admin/CandidaturesPage';
import CandidatureSpontaneePage from './pages/candidate/CandidatureSpontaneePage';
import AgendaPage from './pages/candidate/AgendaPage';
import AgendaEmployeePage from './pages/employee/AgendaPage';
import MesDocumentsPage from './pages/employee/MesDocumentsPage';
import DemandesDocumentsPage from './pages/admin/DemandesDocumentsPage';
import EvenementsPage from './shared/EvenementsPage';
import EvenementsAdminPage from './pages/admin/EvenementsAdminPage';
import RecommandationsPage from './pages/candidate/RecommandationsPage';
import MessageriePage from './shared/MessageriePage';
import AnnuairePage from './shared/AnnuairePage';
import NotesFraisPage from './pages/employee/NotesFraisPage';
import NotesFraisAdminPage from './pages/admin/NotesFraisAdminPage';
import MesCongesPage from './pages/employee/MesCongesPages';
import LogoutPage from './pages/LogoutPage';
import EnrolementFacialPage from './pages/employee/EnrolementFacialPage';
import PointagePage from './pages/employee/PointagePage';
import LandingPage from './shared/LandingPage';
import CooptationPage from './pages/employee/CooptationPage';
import CooptationsAdminPage from './pages/admin/CooptationsAdminPage';
import DashboardCandidatPage from './pages/candidate/DashboardCandidatPage';
import OffreDetailPage from './pages/candidate/OffreDetailPage';
import ValidationDossiersPage from './pages/admin/ValidationDossiersPage';
import ParametresEntreprisePage from './pages/admin/Parametresentreprisepage';
import ImportEmployesPage from './pages/admin/Importemployespage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Routes RH - Ancien système (compatible) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['RH']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/invoicing"
          element={
            <ProtectedRoute allowedRoles={['RH']}>
              <InvoicingPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedRoute allowedRoles={['RH']}>
              <CalendarPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/employe/documents"
          element={
            <ProtectedRoute allowedRoles={['EMPLOYE']}>
              <MesDocumentsPage />
            </ProtectedRoute>
          }
        />

        <Route
  path="/documents-rh"
  element={
    <ProtectedRoute allowedRoles={['RH']}>
      <DemandesDocumentsPage />
    </ProtectedRoute>
  }
/>


<Route path="/notes-frais" element={
  <ProtectedRoute allowedRoles={['EMPLOYE']}>
    <NotesFraisPage />
  </ProtectedRoute>
} />

<Route path="/frais-rh" element={
  <ProtectedRoute allowedRoles={[ 'RH']}>
    <NotesFraisAdminPage />
  </ProtectedRoute>
} />


<Route path="/evenements" element={
  <ProtectedRoute allowedRoles={['EMPLOYE', 'CANDIDAT', 'RH']}>
    <EvenementsPage />
  </ProtectedRoute>
} />
<Route path="/evenementsAdmin" element={
  <ProtectedRoute allowedRoles={[ 'RH']}>
    <EvenementsAdminPage />
  </ProtectedRoute>
} />
<Route path="/annuaire" element={
  <ProtectedRoute allowedRoles={[ 'RH','EMPLOYE']}>
    <AnnuairePage />
  </ProtectedRoute>
} />

<Route path="/candidat/recommandations" element={
  <ProtectedRoute allowedRoles={['CANDIDAT']}><RecommandationsPage /></ProtectedRoute>
} />

<Route path="/messages" element={
  <ProtectedRoute allowedRoles={['CANDIDAT', 'RH','EMPLOYE']}><MessageriePage /></ProtectedRoute>
} /> 

<Route path="/dashboard" element={<DashboardCandidatPage/>} />

<Route path="/messages/collegue/:employeId" element={<MessageriePage />} />
<Route path="/employe/cooptation" element={<CooptationPage />} />
<Route path="/admin/cooptations" element={<CooptationsAdminPage />} />

<Route path="/employe/agenda"  element={ 
  <ProtectedRoute allowedRoles={['EMPLOYE']}> <AgendaEmployeePage /></ProtectedRoute>} />

<Route path="/messages/:candidatureId" element={
  <ProtectedRoute allowedRoles={['CANDIDAT', 'RH']}><MessageriePage /></ProtectedRoute>
} />
        <Route
          path="/time-tracking"
          element={
            <ProtectedRoute allowedRoles={['RH']}>
              <TimeTrackingPage />
            </ProtectedRoute>
          }
        />

        

        <Route
          path="/job-offers"
          element={
            <ProtectedRoute allowedRoles={['RH']}>
              <RecruitmentPage />
            </ProtectedRoute>
          }
        />


<Route
  path="/candidatures"
  element={
    <ProtectedRoute allowedRoles={['RH']}>
      <CandidaturesPage />
    </ProtectedRoute>
  }
/>

<Route
  path="/candidat/candidature-spontanee"
  element={
    <ProtectedRoute allowedRoles={['CANDIDAT']}>
      <CandidatureSpontaneePage />
    </ProtectedRoute>
  }
/>

<Route
  path="/candidat/agenda"
  element={
    <ProtectedRoute allowedRoles={['CANDIDAT']}>
      <AgendaPage />
    </ProtectedRoute>
  }
/>




        {/* Nouveau système avec permissions */}
        <Route
          path="/allemployees"
          element={
            <ProtectedRoute 
              allowedRoles={['RH']}
              requiredPermission="canViewAllEmployees"
            >
              <EmployeesPage />
            </ProtectedRoute>
          }
        />

          <Route path="/admin/import" element={<ImportEmployesPage />} />
        <Route
          path="/pipeline"
          element={
            <ProtectedRoute allowedRoles={['RH']}>
              <PipelinePage />
            </ProtectedRoute>
          }
        />

        {/* Routes Employé */}
        <Route
          path="/employe"
          element={
            <ProtectedRoute allowedRoles={['EMPLOYE']}>
              <EmployeeDashboard />
            </ProtectedRoute>
          }
        />

<Route
  path="/admin/conges"
  element={
    <ProtectedRoute allowedRoles={['RH']}>
      <CongesAdminPage 
     />
    </ProtectedRoute>
  }
/>
<Route
  path="/employee/conges"
  element={
    <ProtectedRoute allowedRoles={['EMPLOYE']}>
      <MesCongesPage
     />
    </ProtectedRoute>
  }
/>
       

<Route
  path="/payroll"
  element={
    <ProtectedRoute allowedRoles={['RH']}>
      <PayrollManagementPage
     />
    </ProtectedRoute>
  }
/>

<Route path="/employe/factures" element={
  <ProtectedRoute allowedRoles={['EMPLOYE']}>
    <MesFacturesPage />
  </ProtectedRoute>
} />

<Route path="/employe/pointage" element={<PointagePage />} />

<Route path="/employe/reconnaissance-faciale" element={<EnrolementFacialPage />} />
<Route path="/logout" element={
  
    <LogoutPage />
 
} />

<Route path="/employe/historique-pointage" element={
  <ProtectedRoute allowedRoles={['EMPLOYE']}>
    <HistoriquePointagePage />
  </ProtectedRoute>
} />

        {/* Routes Candidat */}
        <Route
          path="/candidat/jobs"
          element={
            <ProtectedRoute allowedRoles={['CANDIDAT']}>
              <div>Jobs publics</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/candidat/profile"
          element={
            <ProtectedRoute allowedRoles={['CANDIDAT']}>
              <CandidatProfilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/employe/profile"
          element={
            <ProtectedRoute allowedRoles={['EMPLOYE']}>
              <EmployeeProfilePage />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/candidat/quizzes"
          element={
            <ProtectedRoute allowedRoles={['CANDIDAT']}>
              <AssessmentsPage />
            </ProtectedRoute>
          }
        />
                <Route
          path="/candidat/quiz/:quizId"
          element={
            <ProtectedRoute allowedRoles={['CANDIDAT']}>
              <QuizPage />
            </ProtectedRoute>
          }
        />

        

        
<Route path="/candidat/offres" element={
  <ProtectedRoute allowedRoles={['CANDIDAT']}>
    <div> Job Offres </div>
   <JobsPage/>
  </ProtectedRoute>
  } />
<Route path="/candidat/offres/:id" element={<OffreDetailPage />} />

<Route path="/admin/dossiers" element={<ValidationDossiersPage />} />

<Route path="/admin/entreprise" element={<ParametresEntreprisePage />} />

<Route path="/candidat/mes-candidatures" element={
  <ProtectedRoute allowedRoles={['CANDIDAT']}>
    <MesCandidaturesPage />
  </ProtectedRoute>
} />

        <Route
          path="/reports"
          element={
            <ProtectedRoute 
              allowedRoles={['RH']}
            >
              <ReportsPage />
            </ProtectedRoute>
          }
        />



        {/* Redirections */}

<Route path="/register" element={<RegisterCandidatPage />} />
<Route path="/" element={<LandingPage />} />
        <Route path="*" element={<Navigate to="/unauthorized" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
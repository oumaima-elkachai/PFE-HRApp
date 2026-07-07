import { GitBranch, Plus, MoreHorizontal } from 'lucide-react';

const stages = [
  {
    name: 'Sourcing',
    color: 'bg-[#9ca3af]',
    count: 24,
    items: ['LinkedIn outreach campaign', 'University partnerships', 'Referral program Q4'],
  },
  {
    name: 'Screening',
    color: 'bg-[#3b82f6]',
    count: 11,
    items: ['Resume reviews – Engineering', 'Phone screens scheduled', 'Skills assessments sent'],
  },
  {
    name: 'Interviewing',
    color: 'bg-[#f59e0b]',
    count: 8,
    items: ['Technical rounds – 4 candidates', 'Culture fit interviews', 'Panel interviews next week'],
  },
  {
    name: 'Offer',
    color: 'bg-[#2d6a4f]',
    count: 3,
    items: ['Oliver West – awaiting signature', 'Priya Nair – negotiation', 'James Liu – accepted'],
  },
];

export default function PipelinePage() {
  return (
    <div className="p-7">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Hiring Pipeline</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Track candidates from sourcing to offer</p>
        </div>
        <button className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />
          Add Candidate
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stages.map(stage => (
          <div key={stage.name}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <span className="font-semibold text-[#1a1a1a] text-sm">{stage.name}</span>
                <span className="text-xs text-[#6b7280] bg-[#f0ebe0] px-2 py-0.5 rounded-full">{stage.count}</span>
              </div>
              <button className="text-[#9ca3af] hover:text-[#6b7280]">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {stage.items.map((item, i) => (
                <div key={i} className="bg-white rounded-xl border border-[#e5e0d8] p-4 cursor-pointer hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-2 mb-2">
                    <GitBranch className="w-4 h-4 text-[#2d6a4f] shrink-0 mt-0.5" />
                    <span className="text-sm text-[#1a1a1a] font-medium leading-snug">{item}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <div className="w-5 h-5 rounded-full bg-[#2d6a4f] flex items-center justify-center text-white text-[9px] font-bold">HR</div>
                    <span className="text-[11px] text-[#9ca3af]">{Math.floor(Math.random() * 5 + 1)}d ago</span>
                  </div>
                </div>
              ))}
              <button className="w-full text-xs text-[#9ca3af] flex items-center gap-1 py-2 hover:text-[#2d6a4f] transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

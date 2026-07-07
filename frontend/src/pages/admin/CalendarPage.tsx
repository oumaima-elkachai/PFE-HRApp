import Layout from '@/components/layout/Layout';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

const events = [
  { day: 2, title: 'Interview : Julianna Thorne', time: '10:00 AM', color: 'bg-[#d8f3dc] text-[#2d6a4f]' },
  { day: 5, title: 'All Hands Meeting', time: '2:00 PM', color: 'bg-[#dbeafe] text-[#1e40af]' },
  { day: 8, title: 'Q4 Review Session', time: '9:00 AM', color: 'bg-[#fef3c7] text-[#92400e]' },
  { day: 12, title: 'Payroll Processing', time: '11:00 AM', color: 'bg-[#d8f3dc] text-[#2d6a4f]' },
  { day: 15, title: 'Interview : Sarah Al-Fayed', time: '2:30 PM', color: 'bg-[#d8f3dc] text-[#2d6a4f]' },
  { day: 18, title: 'Performance Reviews', time: '10:00 AM', color: 'bg-[#fef3c7] text-[#92400e]' },
  { day: 22, title: 'Team Building Event', time: '3:00 PM', color: 'bg-[#dbeafe] text-[#1e40af]' },
  { day: 25, title: 'Onboarding : Marcus Chen', time: '9:00 AM', color: 'bg-[#d8f3dc] text-[#2d6a4f]' },
  { day: 28, title: 'Monthly Sync', time: '4:00 PM', color: 'bg-[#fef3c7] text-[#92400e]' },
];

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const [currentMonth] = useState(new Date(2023, 9)); // October 2023

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleString('default', { month: 'long' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const getEventsForDay = (day: number) => events.filter(e => e.day === day);

  return (
    <Layout>
    <div className="p-7">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Calendar</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Schedule and manage team events</p>
        </div>
        <button className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />
          Add Event
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden">
        {/* Month header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0ebe0]">
          <button className="p-2 hover:bg-[#f5f0e8] rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-[#6b7280]" />
          </button>
          <h3 className="font-bold text-[#1a1a1a]">{monthName} {year}</h3>
          <button className="p-2 hover:bg-[#f5f0e8] rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-[#6b7280]" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-[#f0ebe0]">
          {weekdays.map(day => (
            <div key={day} className="py-2 text-center text-xs font-semibold text-[#9ca3af] uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const dayEvents = day ? getEventsForDay(day) : [];
            const isToday = day === 28;
            return (
              <div
                key={idx}
                className={`min-h-25 p-2 border-b border-r border-[#f0ebe0] ${
                  day ? 'hover:bg-[#fafaf8] cursor-pointer' : 'bg-[#fafaf8]/50'
                }`}
              >
                {day && (
                  <>
                    <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm mb-1 font-medium ${
                      isToday ? 'bg-[#2d6a4f] text-white' : 'text-[#374151]'
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((ev, i) => (
                        <div key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-medium truncate ${ev.color}`}>
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </Layout>
  );
}

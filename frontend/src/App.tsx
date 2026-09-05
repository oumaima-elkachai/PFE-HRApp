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
            <ProtectedRoute roles={['RH']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/invoicing"
          element={
            <ProtectedRoute roles={['RH']}>
              <InvoicingPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedRoute roles={['RH']}>
              <CalendarPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/time-tracking"
          element={
            <ProtectedRoute roles={['RH']}>
              <TimeTrackingPage />
            </ProtectedRoute>
          }
        />

        

        <Route
          path="/job-offers"
          element={
            <ProtectedRoute roles={['RH']}>
              <RecruitmentPage />
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
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/unauthorized" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
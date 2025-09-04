import ProfilePage from "@/components/ProfilePage";
import PrivateRoute from "@/components/PrivateRoute";
import DashboardLayout from "@/components/DashboardLayout";

export default function Profile() {
  return (
    <PrivateRoute>
      <DashboardLayout>
        <ProfilePage />
      </DashboardLayout>
    </PrivateRoute>
  );
}
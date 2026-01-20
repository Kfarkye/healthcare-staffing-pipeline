import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LayoutProvider } from './context/LayoutContext';
import { router } from './config/routes';
import './styles/animations.css';

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <LayoutProvider>
        <RouterProvider router={router} />
      </LayoutProvider>
    </AuthProvider>
  );
}

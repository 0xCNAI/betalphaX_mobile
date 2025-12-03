import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

const Login = () => {
  const [error, setError] = useState('');
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (err) {
      setError('Failed to log in with Google: ' + err.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="icon-wrapper">
            <LogIn size={32} className="auth-icon" />
          </div>
          <h2>Welcome to BetAlpha</h2>
          <p>Your AI-Powered Crypto Trading Journal</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-actions">
          <button onClick={handleGoogleLogin} className="btn-google">
            <svg className="google-icon" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <g transform="matrix(1, 0, 0, 1, 27.009001, -39.23856)">
                <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
                <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
                <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
                <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
              </g>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>

      <style>{`
                .auth-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background: radial-gradient(circle at top right, rgba(37, 99, 235, 0.1), transparent 40%),
                                radial-gradient(circle at bottom left, rgba(139, 92, 246, 0.1), transparent 40%);
                }
                .auth-card {
                    background: rgba(30, 41, 59, 0.7);
                    backdrop-filter: blur(12px);
                    padding: 3rem;
                    border-radius: 1.5rem;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    width: 100%;
                    max-width: 420px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    text-align: center;
                }
                .auth-header {
                    margin-bottom: 2.5rem;
                }
                .icon-wrapper {
                    background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2));
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .auth-icon {
                    color: #60a5fa;
                }
                .auth-header h2 {
                    font-size: 1.875rem;
                    font-weight: 700;
                    color: #f8fafc;
                    margin-bottom: 0.5rem;
                    letter-spacing: -0.025em;
                }
                .auth-header p {
                    color: #94a3b8;
                    font-size: 0.95rem;
                }
                .auth-error {
                    background: rgba(239, 68, 68, 0.15);
                    color: #fca5a5;
                    padding: 1rem;
                    border-radius: 0.75rem;
                    margin-bottom: 1.5rem;
                    font-size: 0.875rem;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .btn-google {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    background: white;
                    color: #1e293b;
                    border: none;
                    padding: 0.875rem;
                    border-radius: 0.75rem;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    gap: 0.75rem;
                }
                .btn-google:hover {
                    background: #f1f5f9;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .btn-google:active {
                    transform: translateY(0);
                }
            `}</style>
    </div>
  );
};

export default Login;

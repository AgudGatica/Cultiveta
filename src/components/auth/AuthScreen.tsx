import React, { useState } from 'react';
import { Sprout, Mail, Lock, User, Sparkles, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { authService } from '../../services/authService';

interface AuthScreenProps {
  onSuccess: () => void;
  onExploreDemo: () => void;
}

const inputClass =
  'w-full min-h-11 pl-10 pr-4 py-2.5 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all placeholder:text-ink-subtle';

const linkClass = 'min-h-11 inline-flex items-center font-bold text-brand hover:underline cursor-pointer';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onExploreDemo }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResettingPass, setIsResettingPass] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      await authService.loginWithGoogle();
      onSuccess();
    } catch (err: any) {
      console.error('Google login error', err);
      if (err?.code === 'auth/popup-blocked') {
        setError('El navegador bloqueó la ventana emergente. Habilitá las ventanas emergentes o entrá con tu email.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setError('Se cerró la ventana de inicio de sesión de Google antes de terminar.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setError('Operación cancelada. Probá de nuevo.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError('Este dominio todavía no está autorizado en Firebase Auth. Podés entrar con tu email o en Modo Demo.');
      } else {
        setError(err?.message || 'No se pudo iniciar sesión con Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || (!isResettingPass && !password)) {
      setError('Completá todos los campos obligatorios.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isResettingPass) {
        await authService.resetPassword(email);
        setResetSent(true);
      } else if (isRegistering) {
        await authService.registerWithEmail(email, password, name);
        onSuccess();
      } else {
        await authService.loginWithEmail(email, password);
        onSuccess();
      }
    } catch (err: any) {
      console.error('Auth error', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Email o contraseña incorrectos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Ya existe una cuenta con este correo electrónico.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setError(err?.message || 'Ocurrió un error al autenticar.');
      }
    } finally {
      setLoading(false);
    }
  };

  const title = isResettingPass ? 'Recuperá tu contraseña' : isRegistering ? 'Creá tu cuenta' : 'Entrá a tu diario';

  return (
    <div className="cultiveta-app-shell flex flex-col justify-center items-center px-4 py-8">
      <div aria-hidden="true" className="cultiveta-page-background" />
      {/* Marca sobre el fondo */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-primary text-ink flex items-center justify-center shadow-card">
          <Sprout className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
        </div>
        <span className="text-3xl font-extrabold tracking-tight text-white">
          Cultiveta<span className="text-logo-dot">.</span>
        </span>
      </div>

      <main className="w-full max-w-md bg-card rounded-card shadow-card border border-ink/10 p-6 sm:p-8">
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        <p className="text-sm text-ink-muted mt-1">Tu cultivo. Tu historial. Tu Cultiveta.</p>

        {error && (
          <div role="alert" className="mt-5 p-3.5 rounded-2xl bg-error/10 border border-error/30 text-error text-sm font-medium leading-relaxed">
            {error}
          </div>
        )}

        {resetSent && (
          <div role="status" className="mt-5 p-3.5 rounded-2xl bg-ok-bg border border-ok-line text-ok-ink text-sm font-medium leading-relaxed flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Te mandamos un correo con los pasos para recuperar tu contraseña.</span>
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 mt-6" noValidate>
          {isRegistering && !isResettingPass && (
            <div>
              <label htmlFor="auth-name-input" className="block text-sm font-bold text-ink mb-1.5">
                Nombre o apodo
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-ink-subtle absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-name-input"
                  type="text"
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre de cultivador"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-email-input" className="block text-sm font-bold text-ink mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-ink-subtle absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="auth-email-input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vos@ejemplo.com"
                className={inputClass}
              />
            </div>
          </div>

          {!isResettingPass && (
            <div>
              <label htmlFor="auth-password-input" className="block text-sm font-bold text-ink mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-ink-subtle absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  className="absolute right-0 top-0 h-full min-w-11 flex items-center justify-center rounded-r-2xl text-ink-muted hover:text-ink cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {!isRegistering && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResettingPass(true);
                      setError(null);
                    }}
                    className={`${linkClass} text-sm`}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            id="auth-submit-btn"
            disabled={loading}
            className="w-full min-h-12 py-3 px-4 rounded-2xl bg-primary hover:brightness-95 text-ink font-bold text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {isResettingPass ? 'Mandarme el enlace' : isRegistering ? 'Crear cuenta' : 'Entrar'}
          </button>
        </form>

        {!isResettingPass && (
          <button
            type="button"
            id="google-signin-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full min-h-11 mt-3 py-2.5 px-4 rounded-2xl bg-card border border-chip-line hover:bg-surface text-ink font-bold text-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            Entrar con Google
          </button>
        )}

        <div className="mt-5 text-center text-sm text-ink-muted">
          {isResettingPass ? (
            <button
              type="button"
              onClick={() => {
                setIsResettingPass(false);
                setResetSent(false);
                setError(null);
              }}
              className={linkClass}
            >
              Volver a entrar
            </button>
          ) : isRegistering ? (
            <p>
              ¿Ya tenés cuenta?{' '}
              <button
                type="button"
                id="toggle-to-login-btn"
                onClick={() => {
                  setIsRegistering(false);
                  setError(null);
                }}
                className={linkClass}
              >
                Entrá
              </button>
            </p>
          ) : (
            <p>
              ¿No tenés cuenta?{' '}
              <button
                type="button"
                id="toggle-to-register-btn"
                onClick={() => {
                  setIsRegistering(true);
                  setError(null);
                }}
                className={linkClass}
              >
                Creá tu cuenta
              </button>
            </p>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-line">
          <button
            type="button"
            id="demo-mode-btn"
            onClick={onExploreDemo}
            className="w-full min-h-11 py-2.5 px-3 rounded-2xl bg-surface hover:bg-track text-ink text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 border border-line"
          >
            <Sparkles className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>Probar en Modo Demo</span>
          </button>
        </div>
      </main>
    </div>
  );
};

import React, { useState } from 'react';
import { Sprout, Mail, Lock, User, ArrowRight, Sparkles, CheckCircle2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { authService } from '../../services/authService';

interface AuthScreenProps {
  onSuccess: () => void;
  onExploreDemo: () => void;
}

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
        setError('El navegador bloqueó la ventana emergente. Por favor habilita ventanas emergentes o usa tu email.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setError('Se cerró la ventana de inicio de sesión de Google antes de finalizar.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setError('Operación cancelada. Intenta nuevamente.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError('Este dominio aún no está autorizado en Firebase Auth. Puedes iniciar sesión con email o Modo Demo.');
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
      setError('Completa todos los campos obligatorios.');
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

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      {/* Background Bento glow elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 rounded-full bg-zinc-800/30 blur-3xl pointer-events-none" />
      <div className="absolute top-[40%] right-[15%] w-72 h-72 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#0F0F0F] rounded-[32px] p-8 sm:p-10 shadow-2xl border border-zinc-800 relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-[22px] bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 mb-4 transform -rotate-2 hover:rotate-0 transition-transform">
            <span className="text-3xl">🌱</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white lowercase">cultiveta</h1>
          <p className="text-[10px] font-mono font-bold text-emerald-400 tracking-[0.25em] uppercase mt-1">
            Diario Inteligente de Cultivo
          </p>
          <p className="text-zinc-400 text-xs sm:text-sm mt-3 font-medium">
            Tu cultivo. Tu historial. Tu Cultiveta.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium leading-relaxed">
            {error}
          </div>
        )}

        {/* Reset password success */}
        {resetSent && (
          <div className="mb-6 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium leading-relaxed flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Te enviamos un correo con las instrucciones para restablecer tu contraseña.</span>
          </div>
        )}

        {/* Google sign-in */}
        {!isResettingPass && (
          <div className="space-y-4 mb-6">
            <button
              type="button"
              id="google-signin-btn"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold text-xs sm:text-sm border border-zinc-700 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">o con email</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
          </div>
        )}

        {/* Email Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isRegistering && !isResettingPass && (
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">Nombre o apodo</label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="auth-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre de cultivador"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white text-xs sm:text-sm focus:outline-hidden focus:border-emerald-500 transition-all placeholder:text-zinc-600"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">Correo electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@cultiveta.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white text-xs sm:text-sm focus:outline-hidden focus:border-emerald-500 transition-all placeholder:text-zinc-600"
              />
            </div>
          </div>

          {!isResettingPass && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-zinc-300">Contraseña</label>
                {!isRegistering && (
                  <button
                    type="button"
                    onClick={() => setIsResettingPass(true)}
                    className="text-[11px] font-semibold text-emerald-400 hover:underline cursor-pointer"
                  >
                    ¿Olvidaste tu clave?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white text-xs sm:text-sm focus:outline-hidden focus:border-emerald-500 transition-all placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            id="auth-submit-btn"
            disabled={loading}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            <span>
              {isResettingPass
                ? 'Enviar enlace de recuperación'
                : isRegistering
                ? 'Crear cuenta en Cultiveta'
                : 'Iniciar Sesión'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Toggle between Login, Register, Reset */}
        <div className="mt-6 text-center text-xs text-zinc-400">
          {isResettingPass ? (
            <button
              type="button"
              onClick={() => {
                setIsResettingPass(false);
                setResetSent(false);
              }}
              className="font-bold text-emerald-400 hover:underline cursor-pointer"
            >
              ← Volver al inicio de sesión
            </button>
          ) : isRegistering ? (
            <p>
              ¿Ya tenés una cuenta?{' '}
              <button
                type="button"
                id="toggle-to-login-btn"
                onClick={() => setIsRegistering(false)}
                className="font-bold text-emerald-400 hover:underline cursor-pointer ml-1"
              >
                Iniciar sesión
              </button>
            </p>
          ) : (
            <p>
              ¿Aún no tenés cuenta?{' '}
              <button
                type="button"
                id="toggle-to-register-btn"
                onClick={() => setIsRegistering(true)}
                className="font-bold text-emerald-400 hover:underline cursor-pointer ml-1"
              >
                Crear cuenta gratis
              </button>
            </p>
          )}
        </div>

        {/* Instant Demo Explorer Mode */}
        <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
          <button
            type="button"
            id="demo-mode-btn"
            onClick={onExploreDemo}
            className="w-full py-2.5 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 border border-zinc-800"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Explorar Cultiveta en Modo Demo</span>
          </button>
          <p className="text-[10px] text-zinc-500 mt-2.5 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Seguimiento 100% privado y seguro bajo tu usuario.
          </p>
        </div>
      </div>
    </div>
  );
};


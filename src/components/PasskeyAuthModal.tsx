import React, { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  ShieldCheck,
  Fingerprint,
  LogOut,
  Trash2,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import {
  IdentitySession,
  PasskeyCredentialRecord,
  WebAuthnCapabilityReport,
} from '../domain/identity';
import { ThemeMode, UserRole } from '../types';
import { CornerFlourish } from './OrnamentalFlourish';

interface PasskeyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: IdentitySession;
  passkeys: PasskeyCredentialRecord[];
  capabilities: WebAuthnCapabilityReport;
  isBusy: boolean;
  authError: string | null;
  currentRole: UserRole;
  theme?: ThemeMode;
  onRegisterPasskey: (
    displayName: string,
    role: UserRole,
    masterInviteCode?: string
  ) => Promise<void> | void;
  onSignInWithPasskey: () => Promise<void> | void;
  onCreateDemoFallback: (displayName: string, role: UserRole) => Promise<void> | void;
  onSignInDemoFallback?: (credentialId?: string) => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onRevokePasskey: (credentialId: string) => Promise<void> | void;
}

const PasskeyAuthModalContent: React.FC<Omit<PasskeyAuthModalProps, 'isOpen'>> = ({
  onClose,
  session,
  passkeys,
  capabilities,
  isBusy,
  authError,
  currentRole,
  theme = 'dark',
  onRegisterPasskey,
  onSignInWithPasskey,
  onCreateDemoFallback,
  onSignInDemoFallback,
  onSignOut,
  onRevokePasskey,
}) => {
  const [displayName, setDisplayName] = useState<string>(
    currentRole === 'master' ? 'Elena Vasiliev' : 'Marina Sol'
  );
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole);
  const [masterInviteCode, setMasterInviteCode] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isDark = theme === 'dark';
  const simPasskeys = passkeys.filter(p => p.isSimulatedFallback);

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    void onRegisterPasskey(displayName, selectedRole, masterInviteCode.trim() || undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-modal-title"
    >
      <button
        type="button"
        aria-label="Закрыть окно Passkey"
        onClick={onClose}
        className="absolute inset-0 w-full h-full cursor-default"
      />
      <div
        className={`relative z-10 w-full max-w-xl rounded-2xl overflow-hidden border-2 shadow-2xl flex flex-col max-h-[92vh] ${
          isDark
            ? 'gaudi-mosaic-card border-cyan-500/40 text-white'
            : 'bg-white border-amber-500/50 text-slate-900'
        }`}
      >
        <CornerFlourish position="top-left" className="absolute top-2 left-2 z-10" size={32} />
        <CornerFlourish position="top-right" className="absolute top-2 right-2 z-10" size={32} />

        {/* Header */}
        <div className="p-6 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isDark
                  ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                  : 'bg-amber-100 border-amber-400 text-amber-900'
              }`}
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 id="passkey-modal-title" className="font-display font-bold text-lg">
                Passkeys & WebAuthn{' '}
                {session.authenticated && session.verificationScope === 'server_spki_verified'
                  ? '[SERVER SPKI]'
                  : '[LOCAL_ONLY]'}
              </h2>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
                Без паролей · приватный ключ остаётся в TPM / Enclave устройства
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Закрыть окно Passkey"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Honesty Notice */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isDark
                ? 'bg-cyan-950/30 border-cyan-500/30 text-cyan-200'
                : 'bg-amber-50 border-amber-300 text-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <div className="space-y-1">
              <p className="font-medium">
                {capabilities.isSupported
                  ? capabilities.platformAuthenticatorAvailable
                    ? 'WebAuthn поддерживается этим устройством (биометрия / аппаратный ключ готовы).'
                    : 'WebAuthn API доступен (внешний ключ безопасности / системный Passkey + discoverable lookup).'
                  : `WebAuthn ограничен средой: ${capabilities.reason || 'недоступен в текущей песочнице.'}`}
              </p>
              <p className="text-[11px] opacity-80">
                Сервер{' '}
                <span className="font-mono">/api/auth/webauthn/*</span> выдаёт одноразовый challenge с TTL и при наличии зарегистрированного SPKI-ключа подтверждает криптоподпись +{' '}
                <span className="font-mono">HttpOnly</span> сессию (иначе остаётся честный режим{' '}
                <span className="font-mono font-bold">LOCAL_ONLY</span>).
              </p>
            </div>
          </div>

          {/* Active Session Banner */}
          {session.authenticated && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                session.authMethod === 'demo_passkey_sim'
                  ? 'bg-red-950/30 border-red-500/40'
                  : session.authMethod === 'webauthn_presence_only'
                  ? 'bg-amber-950/30 border-amber-500/40'
                  : 'bg-emerald-950/30 border-emerald-500/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <UserCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-sm">
                      {session.displayName ?? 'Guest'}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 uppercase">
                      Роль: {session.role}
                    </span>
                    {session.verificationScope === 'server_spki_verified' &&
                      session.authMethod !== 'demo_passkey_sim' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/70 text-emerald-200 border border-emerald-500/50 font-bold">
                          SERVER SPKI + HTTPONLY
                        </span>
                      )}
                    {session.authMethod === 'demo_passkey_sim' && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/70 text-red-200 border border-red-500/50 font-bold">
                        [SIM] DEMO PREVIEW
                      </span>
                    )}
                    {session.authMethod === 'webauthn_presence_only' && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900/70 text-amber-200 border border-amber-500/50 font-bold">
                        PRESENCE ONLY · NO SPKI
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                    ID: {session.credentialId?.slice(0, 18)}... · Scope: {session.verificationScope} · TTL до:{' '}
                    {session.expiresAt ? new Date(session.expiresAt).toLocaleTimeString() : '—'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onSignOut()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors cursor-pointer self-start sm:self-center disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Выйти</span>
              </button>
            </div>
          )}

          {/* Error Feedback */}
          {authError && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/50 text-xs text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{authError}</span>
            </div>
          )}

          {/* Create Passkey Form */}
          <form onSubmit={handleSubmitCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="passkey-display-name"
                  className="block text-xs font-medium mb-1 opacity-80"
                >
                  Имя профиля (Passkey label)
                </label>
                <input
                  id="passkey-display-name"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  maxLength={48}
                  required
                  className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                    isDark
                      ? 'bg-[#0b0e18] border-cyan-500/30 text-white focus:border-cyan-400'
                      : 'bg-white border-amber-300 text-slate-900 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label
                  htmlFor="passkey-demo-role"
                  className="block text-xs font-medium mb-1 opacity-80"
                >
                  Превью-роль (UI)
                </label>
                <select
                  id="passkey-demo-role"
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as UserRole)}
                  className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                    isDark
                      ? 'bg-[#0b0e18] border-cyan-500/30 text-white'
                      : 'bg-white border-amber-300 text-slate-900'
                  }`}
                >
                  <option value="client">Клиент</option>
                  <option value="master">Мастер (нужен инвайт)</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="passkey-master-invite"
                className="block text-xs font-medium mb-1 opacity-80"
              >
                Одноразовый инвайт-код мастера (опционально, назначается сервером)
              </label>
              <input
                id="passkey-master-invite"
                type="password"
                value={masterInviteCode}
                onChange={e => setMasterInviteCode(e.target.value)}
                maxLength={64}
                placeholder="Оставьте пустым для роли client"
                autoComplete="off"
                className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                  isDark
                    ? 'bg-[#0b0e18] border-cyan-500/30 text-white focus:border-cyan-400'
                    : 'bg-white border-amber-300 text-slate-900 focus:border-amber-500'
                }`}
              />
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="submit"
                disabled={isBusy || !capabilities.isSupported}
                className="btn-vangogh-gold text-xs py-2.5 px-4 inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Fingerprint className="w-4 h-4" />
                <span>{isBusy ? 'Запрос устройства...' : 'Создать WebAuthn Passkey'}</span>
              </button>

              {capabilities.isSupported && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onSignInWithPasskey()}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors inline-flex items-center gap-2 cursor-pointer ${
                    isDark
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/25'
                      : 'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Проверить Passkey</span>
                </button>
              )}

              {simPasskeys.length > 0 && onSignInDemoFallback && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onSignInDemoFallback(simPasskeys[0].id)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-mono border border-amber-500/40 bg-amber-950/30 text-amber-200 hover:bg-amber-950/50 transition-colors cursor-pointer"
                >
                  Войти с [SIM] ключом
                </button>
              )}

              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onCreateDemoFallback(displayName, selectedRole)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-mono border border-red-500/40 bg-red-950/30 text-red-200 hover:bg-red-950/50 transition-colors cursor-pointer"
              >
                [SIM] Новый демо-ключ
              </button>
            </div>
          </form>

          {/* Registered Credentials Registry */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <h3 className="text-xs font-mono uppercase tracking-wider opacity-75">
              Публичные ключи в локальном реестре ({passkeys.length})
            </h3>

            {passkeys.length === 0 ? (
              <p className="text-xs opacity-65 py-2">
                Локальный реестр IndexedDB пуст (для уже созданного аппаратного ключа сработает discoverable lookup).
              </p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {passkeys.map(pk => (
                  <div
                    key={pk.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                      isDark
                        ? 'bg-[#0b0e18]/80 border-white/10'
                        : 'bg-amber-50/50 border-amber-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{pk.displayName}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 uppercase">
                          demo:{pk.role}
                        </span>
                        {pk.isSimulatedFallback && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-500/40">
                            [SIM]
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono opacity-65 truncate mt-0.5">
                        Credential: {pk.id.slice(0, 22)}... · RP: {pk.rpId} · Counter: {pk.signCount ?? 0}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onRevokePasskey(pk.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      title="Удалить ключ из реестра"
                      aria-label={`Удалить ключ ${pk.displayName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PasskeyAuthModal: React.FC<PasskeyAuthModalProps> = ({ isOpen, ...rest }) => {
  if (!isOpen) return null;
  return <PasskeyAuthModalContent {...rest} />;
};

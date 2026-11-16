import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DEFAULT_ANONYMOUS_SESSION,
  IdentitySession,
  PasskeyCredentialRecord,
  WebAuthnCapabilityReport,
} from '../domain/identity';
import { UserRole } from '../types';
import {
  authenticateWebAuthnPasskey,
  createSimulatedDemoPasskey,
  detectWebAuthnSupport,
  registerWebAuthnPasskey,
} from '../infrastructure/identity/webAuthnService';

export interface UseIdentitySessionOptions {
  onRoleSynced?: (role: UserRole) => void;
  onPersistPasskeys?: (
    next: PasskeyCredentialRecord[],
    action: string,
    payload: unknown
  ) => Promise<void> | void;
  onPersistSession?: (next: IdentitySession, action: string) => Promise<void> | void;
  onNotify?: (title: string, message: string) => void;
}

export function useIdentitySession({
  onRoleSynced,
  onPersistPasskeys,
  onPersistSession,
  onNotify,
}: UseIdentitySessionOptions = {}) {
  const [passkeys, setPasskeys] = useState<PasskeyCredentialRecord[]>([]);
  const [session, setSession] = useState<IdentitySession>(DEFAULT_ANONYMOUS_SESSION);
  const [capabilities, setCapabilities] = useState<WebAuthnCapabilityReport>({
    isSupported: false,
    platformAuthenticatorAvailable: false,
    isSecureContext: false,
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const passkeysRef = useRef<PasskeyCredentialRecord[]>(passkeys);
  const sessionRef = useRef<IdentitySession>(session);

  useEffect(() => {
    passkeysRef.current = passkeys;
  }, [passkeys]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;
    detectWebAuthnSupport().then(report => {
      if (active) {
        setCapabilities(report);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const openAuthModal = useCallback(() => {
    setAuthError(null);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthError(null);
    setIsAuthModalOpen(false);
  }, []);

  const applyAuthenticatedSession = useCallback(
    async (cred: PasskeyCredentialRecord, isNewRegistration: boolean) => {
      const nextSession: IdentitySession = {
        authenticated: true,
        credentialId: cred.id,
        displayName: cred.displayName,
        role: cred.role,
        authMethod: cred.isSimulatedFallback ? 'demo_passkey_sim' : 'webauthn_passkey',
        signedInAt: new Date().toISOString(),
        verificationScope: 'client_local_only',
      };

      sessionRef.current = nextSession;
      setSession(nextSession);
      onRoleSynced?.(cred.role);
      await onPersistSession?.(
        nextSession,
        isNewRegistration ? 'PASSKEY_REGISTERED_SIGNIN' : 'PASSKEY_AUTHENTICATED'
      );
    },
    [onPersistSession, onRoleSynced]
  );

  const handleRegisterPasskey = useCallback(
    async (displayName: string, role: UserRole) => {
      setIsBusy(true);
      setAuthError(null);
      try {
        const created = await registerWebAuthnPasskey({
          displayName,
          role,
          existingCredentials: passkeysRef.current,
        });

        const nextPasskeys = [created, ...passkeysRef.current];
        passkeysRef.current = nextPasskeys;
        setPasskeys(nextPasskeys);

        await onPersistPasskeys?.(nextPasskeys, 'PASSKEY_REGISTERED', {
          credentialId: created.id,
          role: created.role,
          rpId: created.rpId,
        });

        await applyAuthenticatedSession(created, true);

        onNotify?.(
          'Passkey создан (WebAuthn)',
          `Ключ для «${created.displayName}» зарегистрирован в устройстве и сохранён в IndexedDB.`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось создать Passkey.';
        setAuthError(message);
      } finally {
        setIsBusy(false);
      }
    },
    [applyAuthenticatedSession, onNotify, onPersistPasskeys]
  );

  const handleSignInWithPasskey = useCallback(async () => {
    setIsBusy(true);
    setAuthError(null);
    try {
      const matched = await authenticateWebAuthnPasskey(passkeysRef.current);
      const nextPasskeys = passkeysRef.current.map(c =>
        c.id === matched.id ? { ...c, lastUsedAt: matched.lastUsedAt } : c
      );
      passkeysRef.current = nextPasskeys;
      setPasskeys(nextPasskeys);

      await onPersistPasskeys?.(nextPasskeys, 'PASSKEY_ASSERTION_USED', {
        credentialId: matched.id,
      });

      await applyAuthenticatedSession(matched, false);

      onNotify?.(
        'Вход по Passkey выполнен',
        `Добро пожаловать, ${matched.displayName} (локальная проверка WebAuthn).`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось выполнить вход по Passkey.';
      setAuthError(message);
    } finally {
      setIsBusy(false);
    }
  }, [applyAuthenticatedSession, onNotify, onPersistPasskeys]);

  const handleCreateDemoFallbackPasskey = useCallback(
    async (displayName: string, role: UserRole) => {
      setIsBusy(true);
      setAuthError(null);
      try {
        const demoCred = createSimulatedDemoPasskey(displayName, role);
        const nextPasskeys = [demoCred, ...passkeysRef.current];
        passkeysRef.current = nextPasskeys;
        setPasskeys(nextPasskeys);

        await onPersistPasskeys?.(nextPasskeys, 'DEMO_PASSKEY_SIM_CREATED', {
          credentialId: demoCred.id,
          role: demoCred.role,
        });

        await applyAuthenticatedSession(demoCred, true);

        onNotify?.(
          '[SIM] Demo Passkey Preview',
          `Активирован учебный [SIM] профиль «${demoCred.displayName}» (WebAuthn недоступен в текущей песочнице).`
        );
      } finally {
        setIsBusy(false);
      }
    },
    [applyAuthenticatedSession, onNotify, onPersistPasskeys]
  );

  const handleSignOut = useCallback(async () => {
    const anonymous: IdentitySession = { ...DEFAULT_ANONYMOUS_SESSION };
    sessionRef.current = anonymous;
    setSession(anonymous);
    await onPersistSession?.(anonymous, 'IDENTITY_SIGNED_OUT');
    onNotify?.('Сеанс завершён', 'Вы вышли из локальной сессии Passkey.');
  }, [onNotify, onPersistSession]);

  const handleRevokePasskey = useCallback(
    async (credentialId: string) => {
      const nextPasskeys = passkeysRef.current.filter(c => c.id !== credentialId);
      passkeysRef.current = nextPasskeys;
      setPasskeys(nextPasskeys);

      await onPersistPasskeys?.(nextPasskeys, 'PASSKEY_REVOKED', { credentialId });

      if (sessionRef.current.credentialId === credentialId) {
        const anonymous: IdentitySession = { ...DEFAULT_ANONYMOUS_SESSION };
        sessionRef.current = anonymous;
        setSession(anonymous);
        await onPersistSession?.(anonymous, 'IDENTITY_SESSION_REVOKED');
      }
    },
    [onPersistPasskeys, onPersistSession]
  );

  return {
    passkeys,
    setPasskeys,
    session,
    setSession,
    capabilities,
    isAuthModalOpen,
    openAuthModal,
    closeAuthModal,
    isBusy,
    authError,
    handleRegisterPasskey,
    handleSignInWithPasskey,
    handleCreateDemoFallbackPasskey,
    handleSignOut,
    handleRevokePasskey,
  };
}

import { useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_ANONYMOUS_SESSION,
  IdentitySession,
  isIdentitySessionExpired,
  PasskeyCredentialRecord,
  WebAuthnCapabilityReport,
} from '../domain/identity';
import { SupportedLanguage } from '../i18n/translations';
import { formatAppMessage } from '../i18n/messages';
import { UserRole } from '../types';
import {
  authenticateDemoPasskeySim,
  authenticateWebAuthnPasskey,
  buildSessionExpiryFromNow,
  createSimulatedDemoPasskey,
  detectWebAuthnSupport,
  fetchServerIdentitySessionStatus,
  logoutServerIdentitySession,
  registerWebAuthnPasskey,
} from '../infrastructure/identity/webAuthnService';

export interface UseIdentitySessionOptions {
  language?: SupportedLanguage;
  initialPasskeys?: PasskeyCredentialRecord[];
  initialSession?: IdentitySession;
  externalRevision?: number;
  onRoleSynced?: (role: UserRole) => void;
  onPersistPasskeys?: (
    next: PasskeyCredentialRecord[],
    action: string,
    payload: unknown
  ) => Promise<void>;
  onPersistSession?: (next: IdentitySession, action: string) => Promise<void>;
  onNotify?: (title: string, message: string) => void;
}

export function useIdentitySession({
  language,
  initialPasskeys = [],
  initialSession = DEFAULT_ANONYMOUS_SESSION,
  externalRevision = 0,
  onRoleSynced,
  onPersistPasskeys,
  onPersistSession,
  onNotify,
}: UseIdentitySessionOptions = {}) {
  const normalizedInitialSession = isIdentitySessionExpired(initialSession)
    ? { ...DEFAULT_ANONYMOUS_SESSION }
    : initialSession;

  const [passkeys, setPasskeys] = useState<PasskeyCredentialRecord[]>(initialPasskeys);
  const [session, setSession] = useState<IdentitySession>(normalizedInitialSession);

  useEffect(() => {
    if (externalRevision > 0) {
      setPasskeys(initialPasskeys);
      setSession(
        isIdentitySessionExpired(initialSession)
          ? { ...DEFAULT_ANONYMOUS_SESSION }
          : initialSession
      );
    }
  }, [externalRevision, initialPasskeys, initialSession]);
  const [capabilities, setCapabilities] = useState<WebAuthnCapabilityReport>({
    isSupported: false,
    platformAuthenticatorAvailable: false,
    isSecureContext: false,
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    detectWebAuthnSupport()
      .then(report => {
        if (active) {
          setCapabilities(report);
        }
      })
      .catch(() => {
        // Ignore capability probe failures cleanly
      });
    return () => {
      active = false;
    };
  }, []);

  // Periodic local TTL expiration check (L-04)
  useEffect(() => {
    if (!session.authenticated) return;
    const interval = setInterval(() => {
      if (isIdentitySessionExpired(session)) {
        const anonymous: IdentitySession = { ...DEFAULT_ANONYMOUS_SESSION };
        setSession(anonymous);
        onRoleSynced?.('client');
        void onPersistSession?.(anonymous, 'IDENTITY_SESSION_EXPIRED').catch(() => undefined);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [onPersistSession, onRoleSynced, session]);

  const openAuthModal = useCallback(() => {
    setAuthError(null);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthError(null);
    setIsAuthModalOpen(false);
  }, []);

  const commitSession = useCallback(
    async (
      cred: PasskeyCredentialRecord,
      isNewRegistration: boolean,
      signatureVerified = false,
      serverSpkiVerified = false
    ) => {
      const nowIso = new Date().toISOString();
      const authMethod = cred.isSimulatedFallback
        ? ('demo_passkey_sim' as const)
        : signatureVerified || isNewRegistration
        ? ('webauthn_passkey' as const)
        : ('webauthn_presence_only' as const);

      const nextSession: IdentitySession = {
        authenticated: true,
        credentialId: cred.id,
        displayName: cred.displayName,
        role: cred.role,
        authMethod,
        signedInAt: nowIso,
        expiresAt: buildSessionExpiryFromNow(),
        verificationScope:
          !cred.isSimulatedFallback && serverSpkiVerified
            ? 'server_spki_verified'
            : 'client_local_only',
      };

      // Persist FIRST so failed writes never desync UI from storage (L-12)
      await onPersistSession?.(
        nextSession,
        isNewRegistration ? 'PASSKEY_REGISTERED_SIGNIN' : 'PASSKEY_AUTHENTICATED'
      );
      setSession(nextSession);
      onRoleSynced?.(cred.role);
    },
    [onPersistSession, onRoleSynced]
  );

  const handleRegisterPasskey = useCallback(
    async (displayName: string, role: UserRole, masterInviteCode?: string) => {
      setIsBusy(true);
      setAuthError(null);
      try {
        const created = await registerWebAuthnPasskey({
          displayName,
          role,
          masterInviteCode,
          existingCredentials: passkeys,
          language,
        });

        const nextPasskeys = [created, ...passkeys];
        await onPersistPasskeys?.(nextPasskeys, 'PASSKEY_REGISTERED', {
          credentialId: created.id,
          role: created.role,
          rpId: created.rpId,
        });
        setPasskeys(nextPasskeys);

        const serverStatus = await fetchServerIdentitySessionStatus();
        const isServerBacked =
          serverStatus.authenticated &&
          serverStatus.credentialId === created.id &&
          serverStatus.verificationScope === 'server_spki_verified';

        await commitSession(
          created,
          true,
          Boolean(created.publicKeySpkiBase64Url),
          isServerBacked
        );

        onNotify?.(
          formatAppMessage(
            isServerBacked ? 'identity.register_server_title' : 'identity.register_local_title',
            {},
            language
          ),
          formatAppMessage(
            isServerBacked ? 'identity.register_server_msg' : 'identity.register_local_msg',
            { displayName: created.displayName, role: created.role },
            language
          )
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : formatAppMessage('identity.register_error', {}, language);
        setAuthError(message);
      } finally {
        setIsBusy(false);
      }
    },
    [commitSession, language, onNotify, onPersistPasskeys, passkeys]
  );

  const handleSignInWithPasskey = useCallback(async () => {
    setIsBusy(true);
    setAuthError(null);
    try {
      const {
        credential,
        verification,
        cryptographicSignatureVerified,
        discoveredNew,
        serverStubVerification,
      } = await authenticateWebAuthnPasskey(passkeys, { allowDiscoverableFallback: true });

      const nextPasskeys = discoveredNew
        ? [credential, ...passkeys]
        : passkeys.map(c => (c.id === credential.id ? credential : c));

      await onPersistPasskeys?.(nextPasskeys, 'PASSKEY_ASSERTION_USED', {
        credentialId: credential.id,
        cryptographicSignatureVerified,
        serverSpkiChecked: serverStubVerification.cryptographicServerVerified,
        discoveredNew,
      });
      setPasskeys(nextPasskeys);

      const serverOk = serverStubVerification.cryptographicServerVerified;
      await commitSession(
        credential,
        false,
        verification === 'signature_verified',
        serverOk
      );

      const detail = formatAppMessage(
        verification === 'signature_verified'
          ? 'identity.signin_sig_verified'
          : 'identity.signin_presence_only',
        {},
        language
      );

      onNotify?.(
        formatAppMessage(
          serverOk
            ? 'identity.signin_server_title'
            : verification === 'signature_verified'
            ? 'identity.signin_local_sig_title'
            : 'identity.signin_local_presence_title',
          {},
          language
        ),
        serverOk
          ? formatAppMessage(
              'identity.signin_server_msg',
              { displayName: credential.displayName },
              language
            )
          : formatAppMessage(
              'identity.signin_local_msg',
              { displayName: credential.displayName, detail },
              language
            )
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : formatAppMessage('identity.signin_error', {}, language);
      setAuthError(message);
    } finally {
      setIsBusy(false);
    }
  }, [commitSession, language, onNotify, onPersistPasskeys, passkeys]);

  const handleCreateDemoFallbackPasskey = useCallback(
    async (displayName: string, role: UserRole) => {
      setIsBusy(true);
      setAuthError(null);
      try {
        const demoCred = createSimulatedDemoPasskey(displayName, role);
        const nextPasskeys = [demoCred, ...passkeys];

        await onPersistPasskeys?.(nextPasskeys, 'DEMO_PASSKEY_SIM_CREATED', {
          credentialId: demoCred.id,
          role: demoCred.role,
        });
        setPasskeys(nextPasskeys);

        await commitSession(demoCred, true);

        onNotify?.(
          formatAppMessage('identity.sim_create_title', {}, language),
          formatAppMessage(
            'identity.sim_create_msg',
            { displayName: demoCred.displayName },
            language
          )
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : formatAppMessage('identity.sim_create_error', {}, language);
        setAuthError(message);
      } finally {
        setIsBusy(false);
      }
    },
    [commitSession, language, onNotify, onPersistPasskeys, passkeys]
  );

  const handleSignInDemoPasskey = useCallback(
    async (preferredId?: string) => {
      setIsBusy(true);
      setAuthError(null);
      try {
        const demoCred = authenticateDemoPasskeySim(passkeys, preferredId, language);
        const nextPasskeys = passkeys.map(c => (c.id === demoCred.id ? demoCred : c));

        await onPersistPasskeys?.(nextPasskeys, 'DEMO_PASSKEY_SIM_SIGNIN', {
          credentialId: demoCred.id,
        });
        setPasskeys(nextPasskeys);

        await commitSession(demoCred, false);

        onNotify?.(
          formatAppMessage('identity.sim_signin_title', {}, language),
          formatAppMessage(
            'identity.sim_signin_msg',
            { displayName: demoCred.displayName },
            language
          )
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : formatAppMessage('identity.sim_signin_error', {}, language);
        setAuthError(message);
      } finally {
        setIsBusy(false);
      }
    },
    [commitSession, language, onNotify, onPersistPasskeys, passkeys]
  );

  const handleSignOut = useCallback(async () => {
    setIsBusy(true);
    setAuthError(null);
    try {
      await logoutServerIdentitySession();
      const anonymous: IdentitySession = { ...DEFAULT_ANONYMOUS_SESSION };
      await onPersistSession?.(anonymous, 'IDENTITY_SIGNED_OUT');
      setSession(anonymous);
      onRoleSynced?.('client');
      onNotify?.(
        formatAppMessage('identity.signout_title', {}, language),
        formatAppMessage('identity.signout_msg', {}, language)
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : formatAppMessage('identity.signout_error', {}, language);
      setAuthError(message);
    } finally {
      setIsBusy(false);
    }
  }, [language, onNotify, onPersistSession, onRoleSynced]);

  const handleRevokePasskey = useCallback(
    async (credentialId: string) => {
      setIsBusy(true);
      setAuthError(null);
      try {
        const nextPasskeys = passkeys.filter(c => c.id !== credentialId);
        await onPersistPasskeys?.(nextPasskeys, 'PASSKEY_REVOKED', { credentialId });
        setPasskeys(nextPasskeys);

        if (session.credentialId === credentialId) {
          await logoutServerIdentitySession();
          const anonymous: IdentitySession = { ...DEFAULT_ANONYMOUS_SESSION };
          await onPersistSession?.(anonymous, 'IDENTITY_SESSION_REVOKED');
          setSession(anonymous);
          onRoleSynced?.('client');
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : formatAppMessage('identity.revoke_error', {}, language);
        setAuthError(message);
      } finally {
        setIsBusy(false);
      }
    },
    [language, onPersistPasskeys, onPersistSession, onRoleSynced, passkeys, session.credentialId]
  );

  return {
    passkeys,
    session,
    capabilities,
    isAuthModalOpen,
    openAuthModal,
    closeAuthModal,
    isBusy,
    authError,
    handleRegisterPasskey,
    handleSignInWithPasskey,
    handleCreateDemoFallbackPasskey,
    handleSignInDemoPasskey,
    handleSignOut,
    handleRevokePasskey,
  };
}

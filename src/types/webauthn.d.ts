/**
 * TypeScript definitions for WebAuthn/FIDO2 API
 * These are minimal definitions for the features we use
 */

declare global {
  interface Navigator {
    credentials: CredentialsContainer;
  }

  interface CredentialsContainer {
    create(options?: CredentialCreationOptions): Promise<Credential | null>;
    get(options?: CredentialRequestOptions): Promise<Credential | null>;
    isUserVerifyingPlatformAuthenticatorAvailable(): Promise<boolean>;
  }

  interface CredentialCreationOptions {
    publicKey?: PublicKeyCredentialCreationOptions;
  }

  interface CredentialRequestOptions {
    publicKey?: PublicKeyCredentialRequestOptions;
  }

  interface PublicKeyCredentialCreationOptions {
    challenge: BufferSource;
    rp: PublicKeyCredentialRpEntity;
    user: PublicKeyCredentialUserEntity;
    pubKeyCredParams: PublicKeyCredentialParameters[];
    timeout?: number;
    excludeCredentials?: PublicKeyCredentialDescriptor[];
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    attestation?: AttestationConveyancePreference;
    extensions?: AuthenticationExtensionsClientInputs;
  }

  interface PublicKeyCredentialRequestOptions {
    challenge: BufferSource;
    allowCredentials?: PublicKeyCredentialDescriptor[];
    timeout?: number;
    rpId?: string;
    userVerification?: UserVerificationRequirement;
    extensions?: AuthenticationExtensionsClientInputs;
  }

  interface PublicKeyCredentialRpEntity {
    id?: string;
    name: string;
  }

  interface PublicKeyCredentialUserEntity {
    id: BufferSource;
    name: string;
    displayName: string;
  }

  interface PublicKeyCredentialParameters {
    type: PublicKeyCredentialType;
    alg: number;
  }

  interface PublicKeyCredentialDescriptor {
    type: PublicKeyCredentialType;
    id: BufferSource;
    transports?: AuthenticatorTransport[];
  }

  interface AuthenticatorSelectionCriteria {
    authenticatorAttachment?: AuthenticatorAttachment;
    userVerification?: UserVerificationRequirement;
    residentKey?: ResidentKeyRequirement;
  }

  interface PublicKeyCredential extends Credential {
    id: string;
    rawId: ArrayBuffer;
    response: AuthenticatorResponse;
    type: string;
    getClientExtensionResults(): AuthenticationExtensionsClientOutputs;
  }

  interface AuthenticatorAttestationResponse extends AuthenticatorResponse {
    attestationObject: ArrayBuffer;
    getTransports(): AuthenticatorTransport[];
    getAuthenticatorData(): ArrayBuffer;
    getPublicKey(): ArrayBuffer | null;
    getPublicKeyAlgorithm(): number;
  }

  interface AuthenticatorAssertionResponse extends AuthenticatorResponse {
    authenticatorData: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle: ArrayBuffer | null;
  }

  interface AuthenticatorResponse {
    clientDataJSON: ArrayBuffer;
  }

  type PublicKeyCredentialType = 'public-key';
  type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal';
  type AuthenticatorAttachment = 'platform' | 'cross-platform';
  type UserVerificationRequirement = 'required' | 'preferred' | 'discouraged';
  type ResidentKeyRequirement = 'required' | 'preferred' | 'discouraged';
  type AttestationConveyancePreference = 'none' | 'indirect' | 'direct';

  interface AuthenticationExtensionsClientInputs {
    [key: string]: unknown;
  }

  interface AuthenticationExtensionsClientOutputs {
    [key: string]: unknown;
  }
}

export {};

import { useCallback, useState } from 'react';
import * as yaml from 'js-yaml';

import { useAccountStore } from '../stores/accountStore';

export interface FileContact {
  userPubKeys: Uint8Array;
  userName?: string;
}

type ImportableYaml = {
  // New schema
  userPubKeys?: number[] | string;
  userName?: string;
};

function stringToBytesAuto(str: string): Uint8Array {
  const buf = Buffer.from(str, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function useFileShareContact() {
  const [fileContact, setFileContact] = useState<FileContact | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { userProfile } = useAccountStore();

  const exportFileContact = useCallback(
    async (contact: FileContact) => {
      try {
        setError(null);
        const doc = {
          // Export as base64 using Buffer (no btoa)
          userPubKeys: Buffer.from(contact.userPubKeys).toString('base64'),
          userName: contact.userName ?? undefined,
        };
        const yamlText = yaml.dump(doc, { noRefs: true });
        const blob = new Blob([yamlText], { type: 'text/yaml;charset=utf-8' });
        const file = new File(
          [blob],
          `${userProfile?.username || 'user'}-gossip-contact.yaml`,
          {
            type: 'text/yaml;charset=utf-8',
          }
        );

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
          });
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${userProfile?.username || 'user'}-gossip-contact.yaml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(
          e instanceof Error
            ? `Failed to export file: ${e.message}`
            : 'Failed to export file'
        );
      }
    },
    [userProfile?.username]
  );

  const importFileContact = useCallback(async (file: File) => {
    if (
      !file.name.toLowerCase().endsWith('.yaml') &&
      !file.name.toLowerCase().endsWith('.yml')
    ) {
      setError('Please select a .yaml or .yml file');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const text = await file.text();
      const data = yaml.load(text) as ImportableYaml;

      let bytes: Uint8Array;
      if (typeof data.userPubKeys === 'string') {
        try {
          bytes = stringToBytesAuto(data.userPubKeys);
        } catch (e) {
          setError('Invalid userPubKeys format. Expected base64 string: ' + e);
          return;
        }
      } else if (Array.isArray(data.userPubKeys)) {
        bytes = Uint8Array.from(data.userPubKeys);
      } else {
        setError('Invalid userPubKeys format.');
        return;
      }

      setFileContact({ userPubKeys: bytes, userName: data.userName });
    } catch (e) {
      setError(
        e instanceof Error
          ? `Failed to import file: ${e.message}`
          : 'Failed to import file. Please check the file format.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    fileContact,
    setFileContact,
    exportFileContact,
    importFileContact,
    isLoading,
    error,
  };
}

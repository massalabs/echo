import React, { useEffect, useCallback } from 'react';
import { Contact, db } from '../../db';
import { useMessages } from '../../hooks/useMessages';
import { useDiscussion } from '../../hooks/useDiscussion';
import { useAccountStore } from '../../stores/accountStore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DiscussionHeader from './DiscussionHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { retryPendingOutgoingAnnouncements } from '../../services/announcement';

const DiscussionContent: React.FC<{ contact: Contact | null | undefined }> = ({
  contact,
}) => {
  const navigate = useNavigate();
  const onBack = () => navigate('/');

  // Provide a fallback contact to prevent hook errors
  // The hooks will handle the undefined case internally
  const safeContact =
    contact ||
    ({
      userId: '',
      ownerUserId: '',
      name: '',
      publicKeys: new Uint8Array(),
      isOnline: false,
      lastSeen: new Date(),
      createdAt: new Date(),
    } as Contact);

  const { discussion, isLoading: isDiscussionLoading } = useDiscussion({
    contact: safeContact,
  });

  const { userProfile } = useAccountStore();

  const {
    messages,
    isLoading,
    isSending,
    isSyncing,
    loadMessages,
    sendMessage,
    resendMessage,
    syncMessages,
  } = useMessages({
    contact: contact || undefined,
    discussionId: discussion?.id,
  });

  useEffect(() => {
    if (contact) {
      loadMessages();
    }
  }, [loadMessages, contact]);

  // Mark messages as read when viewing the discussion
  useEffect(() => {
    if (
      messages.length > 0 &&
      !isLoading &&
      userProfile?.userId &&
      contact?.userId
    ) {
      db.markMessagesAsRead(userProfile.userId, contact.userId).catch(error =>
        console.error('Failed to mark messages as read:', error)
      );
    }
  }, [messages.length, isLoading, userProfile?.userId, contact?.userId]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      try {
        await sendMessage(text);
      } catch (error) {
        toast.error('Failed to send message');
        console.error('Failed to send message:', error);
      }
    },
    [sendMessage]
  );

  // Guard against undefined contact - after all hooks
  if (!contact) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Contact not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col w-full">
      <div className="w-full md:max-w-lg lg:max-w-2xl xl:max-w-3xl mx-auto h-full flex flex-col">
        <DiscussionHeader
          contact={contact}
          discussion={discussion}
          isSyncing={isSyncing}
          onBack={onBack}
          onSync={syncMessages}
        />

        {discussion &&
          discussion.status === 'pending' &&
          discussion.direction === 'initiated' && (
            <div className="mx-4 mt-3 mb-1 px-3 py-2 rounded-lg bg-muted">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Awaiting connection – we’ll retry automatically when online.
                </p>
                <button
                  className="text-xs font-medium px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={async () => {
                    await retryPendingOutgoingAnnouncements();
                    await syncMessages();
                  }}
                >
                  Retry now
                </button>
              </div>
            </div>
          )}

        <MessageList
          messages={messages}
          contact={contact}
          isLoading={isLoading || isDiscussionLoading}
          onResend={resendMessage}
        />

        <MessageInput onSend={handleSendMessage} disabled={isSending} />
      </div>
    </div>
  );
};

export default DiscussionContent;

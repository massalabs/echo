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

const DiscussionContent: React.FC<{ contact: Contact | null | undefined }> = ({
  contact,
}) => {
  const navigate = useNavigate();
  const onBack = () => navigate(-1);

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

        <MessageList
          messages={messages}
          contact={contact}
          discussion={discussion}
          isLoading={isLoading || isDiscussionLoading}
          onResend={resendMessage}
        />

        <MessageInput onSend={handleSendMessage} disabled={isSending} />
      </div>
    </div>
  );
};

export default DiscussionContent;

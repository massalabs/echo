import React, { useState, useEffect, useRef } from 'react';
import { Discussion, Contact } from '../../db';
import ContactAvatar from '../avatar/ContactAvatar';
import { formatRelativeTime } from '../../utils/timeUtils';
import { formatUserId } from '../../utils/userId';
import BaseModal from '../ui/BaseModal';
import ContactNameModal from '../ui/ContactNameModal';
import Button from '../ui/Button';

export type LastMessageInfo = { content: string; timestamp: Date } | undefined;

interface DiscussionListItemProps {
  discussion: Discussion;
  contact: Contact;
  lastMessage: LastMessageInfo;
  onSelect: (discussion: Discussion) => void;
  onAccept: (discussion: Discussion, newName?: string) => void;
  onRefuse: (discussion: Discussion) => void;
}

const DiscussionListItem: React.FC<DiscussionListItemProps> = ({
  discussion,
  contact,
  lastMessage,
  onSelect,
  onAccept,
  onRefuse,
}) => {
  const containerClass = 'w-full px-3 py-2 text-left';
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [proposedName, setProposedName] = useState(contact.name || '');
  const [isRefuseModalOpen, setIsRefuseModalOpen] = useState(false);
  // Re-render trigger to update relative time display every minute
  const [_updateKey, setUpdateKey] = useState(0);
  // Use ref to preserve modal state across re-renders caused by periodic sync
  const modalWasOpenedRef = useRef(false);

  // Update every minute to refresh relative time display
  useEffect(() => {
    const interval = setInterval(() => {
      setUpdateKey(prev => prev + 1);
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Preserve modal state across re-renders caused by periodic sync
  // If modal was opened, keep it open even if component re-renders and state is lost
  useEffect(() => {
    const isPendingIncomingCheck =
      discussion.status === 'pending' && discussion.direction === 'received';

    // If discussion is no longer pending, reset the ref
    if (!isPendingIncomingCheck) {
      modalWasOpenedRef.current = false;
      return;
    }

    // Only restore if ref indicates modal should be open but state says it's closed
    if (modalWasOpenedRef.current && !isNameModalOpen) {
      // Use setTimeout to avoid state updates during render
      setTimeout(() => {
        setIsNameModalOpen(true);
      }, 0);
    }
  }, [isNameModalOpen, discussion.id, discussion.status, discussion.direction]);

  const isPendingIncoming =
    discussion.status === 'pending' && discussion.direction === 'received';
  const isPendingOutgoing =
    discussion.status === 'pending' && discussion.direction === 'initiated';

  return (
    <div key={discussion.id} className={containerClass}>
      <div
        className={`${
          isPendingIncoming || isPendingOutgoing
            ? 'cursor-not-allowed opacity-95'
            : 'cursor-pointer hover:ring-1 hover:ring-border'
        } bg-card border border-border rounded-xl px-4 py-3 transition-colors`}
        {...(!(isPendingIncoming || isPendingOutgoing)
          ? {
              onClick: () => onSelect(discussion),
              role: 'button',
              tabIndex: 0,
            }
          : {})}
      >
        <div className="flex items-center space-x-3">
          <ContactAvatar contact={contact} size={12} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground truncate">
                {contact.name}
              </h3>
              <div className="flex items-center gap-2">
                {isPendingOutgoing && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground border border-border">
                    Waiting approval
                  </span>
                )}
                {lastMessage && (
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(lastMessage.timestamp)}
                  </p>
                )}
                {!isPendingIncoming && !isPendingOutgoing && (
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </div>
            </div>
            {isPendingIncoming ? (
              <>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <span className="whitespace-nowrap">User ID:</span>{' '}
                  <span className="break-all">
                    {formatUserId(contact.userId)}
                  </span>
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setProposedName(contact.name || '');
                      modalWasOpenedRef.current = true;
                      setIsNameModalOpen(true);
                    }}
                    variant="primary"
                    size="custom"
                    className="px-2.5 py-1 text-xs font-medium rounded border border-primary text-primary hover:bg-primary/10"
                  >
                    Accept
                  </Button>
                  <Button
                    onClick={() => {
                      setIsRefuseModalOpen(true);
                    }}
                    variant="outline"
                    size="custom"
                    className="px-2.5 py-1 text-xs font-medium rounded border border-border text-foreground hover:bg-accent"
                  >
                    Refuse
                  </Button>
                  {discussion.unreadCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center px-2 py-1 text-[10px] font-bold leading-none text-destructive-foreground bg-destructive rounded-full">
                      {discussion.unreadCount}
                    </span>
                  )}
                </div>
                {/* Name prompt modal */}
                <ContactNameModal
                  isOpen={isNameModalOpen}
                  onClose={() => {
                    modalWasOpenedRef.current = false;
                    setIsNameModalOpen(false);
                  }}
                  title="Set contact name"
                  initialName={proposedName}
                  confirmLabel="Continue"
                  allowEmpty
                  showSkip
                  onConfirm={name => {
                    modalWasOpenedRef.current = false;
                    setIsNameModalOpen(false);
                    if (name && name.trim()) {
                      onAccept(discussion, name.trim());
                    } else {
                      onAccept(discussion);
                    }
                  }}
                  onSkip={() => {
                    modalWasOpenedRef.current = false;
                    setIsNameModalOpen(false);
                    onAccept(discussion);
                  }}
                />
                {/* Refuse confirm modal */}
                <BaseModal
                  isOpen={isRefuseModalOpen}
                  onClose={() => setIsRefuseModalOpen(false)}
                  title="Refuse connection?"
                >
                  <div className="space-y-4">
                    <p className="text-sm text-foreground">
                      Refusing will close this discussion request.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => {
                          setIsRefuseModalOpen(false);
                          onRefuse(discussion);
                        }}
                        variant="danger"
                        size="custom"
                        className="flex-1 h-11 rounded-lg font-semibold"
                      >
                        Refuse
                      </Button>
                      <Button
                        onClick={() => setIsRefuseModalOpen(false)}
                        variant="secondary"
                        size="custom"
                        className="flex-1 h-11 rounded-lg font-semibold"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </BaseModal>
              </>
            ) : (
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm text-muted-foreground truncate">
                  {lastMessage?.content || ''}
                </p>
                {discussion.unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-destructive-foreground bg-destructive rounded-full">
                    {discussion.unreadCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscussionListItem;

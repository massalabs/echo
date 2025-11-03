import React from 'react';
import DiscussionHeader from './DiscussionHeader';
import EmptyDiscussions from './EmptyDiscussions';
import DiscussionListItem from './DiscussionListItem';
import DebugPanel from './DebugPanel';
import Settings from './Settings';
import Wallet from '../pages/Wallet';
import BottomNavigation from './BottomNavigation';
import WelcomeBack from './WelcomeBack';
import AccountCreation from './AccountCreation';
import NewDiscussion from './NewDiscussion';
import NewContact from './NewContact';
import DiscussionView from './Discussion';
import ContactCard from './ContactCard';
import { useDiscussionList } from '../hooks/useDiscussionList';

const DiscussionList: React.FC = () => {
  const { stores, state, selectors, handlers } = useDiscussionList();

  // Show loading state
  if (state.appState === 'loading' || stores.isLoading) {
    return (
      <div className="min-h-screen-mobile bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Show welcome back screen for existing accounts
  if (state.appState === 'welcome') {
    return (
      <WelcomeBack
        key="welcomeback-stable"
        onCreateNewAccount={handlers.handleCreateNewAccount}
        onAccountSelected={handlers.handleAccountSelected}
        accountInfo={state.existingAccountInfo}
        persistentError={state.loginError}
        onErrorChange={handlers.handleLoginError}
      />
    );
  }

  // Show account setup for new users
  if (state.appState === 'setup') {
    return (
      <AccountCreation
        onComplete={handlers.handleSetupComplete}
        onBack={handlers.handleBackToWelcome}
      />
    );
  }

  // Show contact card if opened from selection
  if (state.showContactCard && state.selectedContact) {
    const disc = selectors.getDiscussionByContactUserId(
      state.selectedContact.userId
    );
    const canStart = disc ? disc.status === 'active' : true;
    return (
      <ContactCard
        contact={state.selectedContact}
        onBack={handlers.handleBackFromContactCard}
        onStartDiscussion={handlers.handleStartDiscussionFromCard}
        canStart={canStart}
        discussionStatus={disc?.status}
      />
    );
  }

  // Show discussion view
  if (state.selectedContact) {
    return (
      <DiscussionView
        contact={state.selectedContact}
        onBack={handlers.handleBackFromDiscussion}
        onDiscussionCreated={handlers.handleNewDiscussionCreated}
      />
    );
  }

  if (state.showNewContact) {
    return (
      <NewContact
        onCancel={handlers.handleCancelNewContact}
        onCreated={handlers.handleCreatedNewContact}
      />
    );
  }

  if (state.showNewDiscussion) {
    return (
      <NewDiscussion
        onClose={handlers.handleCloseNewDiscussion}
        onSelectRecipient={handlers.handleSelectRecipient}
        onNewContact={handlers.handleOpenNewContact}
      />
    );
  }

  // Show main app
  if (state.activeTab === 'settings') {
    return <Settings onTabChange={handlers.handleTabChange} />;
  }

  if (state.activeTab === 'wallet') {
    return <Wallet onTabChange={handlers.handleTabChange} />;
  }

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto h-screen-mobile flex flex-col">
        {/* Header */}
        <DiscussionHeader />

        {/* Main content area */}
        <div className="px-4 pb-20 flex-1 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-medium text-black dark:text-white">
                Discussions
              </h2>
              <button
                onClick={handlers.handleRefresh}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
              >
                Refresh
              </button>
            </div>

            {/* Discussions list */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {state.discussions.filter(d => d.status !== 'closed').length ===
              0 ? (
                <EmptyDiscussions />
              ) : (
                // TODO: Allow User to remove annnoucement from bulletin ?
                state.discussions
                  .filter(d => d.status !== 'closed')
                  .map(discussion => {
                    const contact = selectors.getContactByUserId(
                      discussion.contactUserId
                    );
                    if (!contact) return null;

                    const lastMessage = state.lastMessages.get(
                      discussion.contactUserId
                    );
                    const isPendingIncoming =
                      discussion.status === 'pending' &&
                      discussion.direction === 'received';
                    const isPendingOutgoing =
                      discussion.status === 'pending' &&
                      discussion.direction === 'initiated';

                    return (
                      <DiscussionListItem
                        key={discussion.id}
                        discussion={discussion}
                        contact={contact}
                        lastMessage={lastMessage}
                        isPendingIncoming={isPendingIncoming}
                        isPendingOutgoing={isPendingOutgoing}
                        onSelect={handlers.handleSelectDiscussion}
                        onAccept={(d, newName) =>
                          handlers.handleAcceptDiscussionRequest(d, newName)
                        }
                        onRefuse={handlers.handleRefuseDiscussionRequest}
                      />
                    );
                  })
              )}
            </div>

            {/* Debug info - hidden in production */}
            <DebugPanel />
          </div>
        </div>

        {/* Floating Action Button */}
        <button
          onClick={handlers.handleOpenNewDiscussion}
          className="fixed bottom-24 right-4 w-14 h-14 bg-purple-600 dark:bg-purple-700 rounded-full flex items-center justify-center shadow-lg hover:bg-purple-700 dark:hover:bg-purple-800 transition-colors"
        >
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>

        {/* Bottom Navigation */}
        <BottomNavigation
          activeTab={state.activeTab}
          onTabChange={handlers.handleTabChange}
        />
      </div>
    </div>
  );
};

export default DiscussionList;

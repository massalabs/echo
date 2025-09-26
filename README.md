# Echo - Secure Messaging App

Echo is a privacy-first, secure messaging application built with React, TypeScript, and Vite. It provides end-to-end encrypted communication with local data storage, ensuring your conversations remain private and secure.

## Features

- 🔐 **Privacy First**: All messages are encrypted and stored locally on your device
- 💬 **Secure Messaging**: End-to-end encryption for all communications
- 📱 **Progressive Web App**: Install as a native app on any device
- 🏠 **Local Storage**: Your data never leaves your device
- 👤 **User Profiles**: Create and manage your secure identity
- 🎨 **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Database**: Dexie (IndexedDB wrapper)
- **PWA**: Vite PWA Plugin
- **Blockchain**: Massa Web3 SDK

## Getting Started

### Prerequisites

- Node.js (version specified in `.nvmrc`)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd echo
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready for deployment.

## Project Structure

```
src/
├── components/          # React components
│   ├── ErrorBoundary.tsx
│   ├── MainApp.tsx
│   ├── OnboardingFlow.tsx
│   └── UsernameSetup.tsx
├── stores/             # State management
│   └── accountStore.tsx
├── db.ts              # Database schema and operations
├── App.tsx            # Main application component
└── main.tsx           # Application entry point
```

## Database Schema

Echo uses Dexie (IndexedDB) for local data storage with the following entities:

- **UserProfile**: User account information and blockchain credentials
- **Contacts**: Contact list with usernames and public keys
- **Messages**: Encrypted message storage with metadata
- **Conversations**: Chat thread management
- **Settings**: Application preferences

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Code Style

This project uses ESLint with TypeScript support. The configuration can be found in `eslint.config.js`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Security

Echo prioritizes user privacy and security:
- All data is stored locally on your device
- Messages are encrypted before storage
- No data is transmitted to external servers
- Built with modern security best practices

## Roadmap

- [ ] Real-time messaging implementation
- [ ] Contact discovery and management
- [ ] File sharing capabilities
- [ ] Voice and video calling
- [ ] Group messaging
- [ ] Message backup and restore

import React from 'react';
import { Contact } from '../../db';

interface ContactAvatarProps {
  contact: Pick<Contact, 'name' | 'avatar'>;
  size?: number; // tailwind size unit, e.g., 10 -> w-10 h-10
}

const ContactAvatar: React.FC<ContactAvatarProps> = ({
  contact,
  size = 10,
}) => {
  const sizeClass = `w-${size} h-${size}`;

  if (contact.avatar) {
    return (
      <img
        src={contact.avatar}
        alt={contact.name}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }

  const initials = contact.name
    .split(' ')
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`${sizeClass} rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 flex items-center justify-center text-sm font-semibold`}
    >
      {initials}
    </div>
  );
};

export default ContactAvatar;

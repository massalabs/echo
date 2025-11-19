import React from 'react';
import FormInput from '../ui/FormInput';

interface MessageFieldProps {
  message: string;
  onChange: (value: string) => void;
}

const MessageField: React.FC<MessageFieldProps> = ({ message, onChange }) => {
  return (
    <FormInput
      id="contact-message"
      label={
        <>
          Contact request message{' '}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </>
      }
      value={message}
      onChange={onChange}
      placeholder="Introduce yourself or add context to your contact request..."
      type="textarea"
      textareaRows={3}
      maxLength={500}
      showCharCount={true}
    />
  );
};

export default MessageField;

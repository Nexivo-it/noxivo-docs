import React from 'react';

const EngineDocs: React.FC = () => {
  // Use the workflow engine's native swagger documentation endpoint
  // which is now protected by the session cookie
  const docsUrl = import.meta.env.VITE_DOCS_URL || 'http://localhost:4000/v1/docs';

  return (
    <div className="flex flex-col h-full bg-surface-base">
      <div className="flex-1 relative overflow-hidden">
        <iframe 
          src={docsUrl} 
          className="absolute inset-0 w-full h-full border-0"
          title="Noxivo Engine Documentation"
        />
      </div>
    </div>
  );
};

export default EngineDocs;

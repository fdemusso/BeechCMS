/**
 * Message: public contact form submission.
 *
 * allowPublicPost: true  — the Public API accepts POST requests without authentication,
 *                          so any frontend form can submit directly to this seed.
 * email visibility:masked — the email is stored in full but returned partially
 *                           redacted in API responses (e.g. "jo**@example.com").
 * email public:false      — the email is never exposed through the Public API.
 */
export const MESSAGE_SEED: Seed = {
  slug: 'messages',
  label: 'Message',
  labelPlural: 'Messages',
  displayNameAlias: 'name',
  allowPublicPost: true,
  branches: [
    { id: 'msg_01', alias: 'name',    label: 'Name',    type: 'text',     requiredOnCreate: true },
    { id: 'msg_02', alias: 'email',   label: 'Email',   type: 'text',     requiredOnCreate: true, policies: { visibility: 'masked', public: false } },
    { id: 'msg_03', alias: 'subject', label: 'Subject', type: 'text',     requiredOnCreate: true },
    { id: 'msg_04', alias: 'message', label: 'Message', type: 'richtext', requiredOnCreate: true },
    { id: 'msg_05', alias: 'read',    label: 'Read',    type: 'boolean' },
  ],
}

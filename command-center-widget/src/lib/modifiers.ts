export type ModeSpec = { id: string; label: string; instruction: string };

export const PRE_DRAFT_MODES: ModeSpec[] = [
    {
        id: 'working_traveler',
        label: 'Working Traveler',
        instruction: 'Draft a reply to a working traveler based on the screenshot.'
    },
    {
        id: 'extension_request',
        label: 'Extension Request',
        instruction: 'Draft a reply about an extension based on the screenshot.'
    },
    {
        id: 'pay_package',
        label: 'Pay Package',
        instruction: 'Draft a pay package reply based on the screenshot.'
    },
    {
        id: 'screen_resume',
        label: 'Screen Resume',
        instruction: 'Screen the resume in the screenshot and summarize fit.'
    },
    {
        id: 'licensing_request',
        label: 'Licensing',
        instruction: 'Generate a licensing request email to LicensingAllied@ayahealthcare.com. Ask for specialty and state if not provided.'
    },
    {
        id: 'reassignment_request',
        label: 'Reassignment',
        instruction: 'Generate an internal reassignment request email. Include full Nova URL with /new-profile/about suffix.'
    }
];

export const POST_DRAFT_MODIFIERS: { label: string; instruction: string }[] = [
    { label: '+ Ask for certs', instruction: 'Add one sentence asking them to send certifications.' },
    { label: '+ Time-off?', instruction: 'Add one sentence asking if they have any time-off requests (RTO).' },
    { label: '+ Update Aya app', instruction: 'Add one sentence asking them to update their Aya profile/app (not resume).' },
    { label: '+ Match their energy', instruction: 'Rewrite to match their energy while staying professional and human.' },
    { label: '+ Shorter', instruction: 'Make this draft more concise while keeping the key information.' }
];

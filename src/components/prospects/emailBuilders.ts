import type { Prospect } from '../ProspectsDashboard';

const TIFFANY_CC = 'Tiffany.Chavez@ayahealthcare.com';

const getFirstName = (name: string) =>
  (name?.trim()?.split(' ')[0] ?? '').replace(/[^A-Za-z'-]/g, '') || 'there';

const formatNovaLink = (id?: number | null) =>
  id ? `https://app.nomadhealth.com/profiles/${id}` : '';

export function buildReferenceEmail(p: Prospect): string {
  const firstName = getFirstName(p.name);
  const novaUrl = p.nova_url || formatNovaLink(p.candidate_id);

  return `Hi ${firstName},

The facility requires a verified supervisory reference from the past 12 months.
Could you please ask a supervisor from within the last 12 months to complete the attached reference form and email it to References@ayahealthcare.com?

Supervisory Reference – Can be a Team Lead, Charge Nurse, Nurse Practitioner, Unit Manager, or Director.

Please ensure the reference matches one of the references listed on your Aya profile with the correct facility and dates.

For tracking purposes, it would be helpful if they could CC me at Kofi.Farkye@ayahealthcare.com and ${TIFFANY_CC}.

I can begin the submittal process without the reference, but we'll need it completed as soon as possible.

${novaUrl ? `Nova link: ${novaUrl}\n` : ''}Email: ${p.email ?? ''}

Thank you!
Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017`;
}

export function buildReassignmentEmail(p: Prospect): string {
  return `Hi Team,

Can we please reassign ${p.name}?

Email: ${p.email || 'Not Available'}
Nova Profile: ${p.nova_url || formatNovaLink(p.candidate_id)}

Thank you!`;
}

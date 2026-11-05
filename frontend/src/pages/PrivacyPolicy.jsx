import PolicyLayout from '../components/PolicyLayout';
import { PRIVACY_CONTACT } from '../policies';

// Written from what AFN-SERVE actually collects and does. Keep it in step with the system: when a feature starts
// collecting new personal data or uses a new outside service, update this page and POLICY_VERSION.
const List = ({ items }) => (
  <ul className="list-disc space-y-1.5 pl-5">
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
);

const SECTIONS = [
  {
    id: 'what-we-collect',
    title: 'Information we collect',
    body: (
      <>
        <p>We only collect what we need to deliver and support your service.</p>
        <List items={[
          'Account details: your name, username, email address, mobile and landline numbers, address, optional company name and profile photo.',
          'Service requests: the services you choose, the service address, city and province, the map pin you place for the site, your preferred date and time, and any notes you add.',
          'Job records: schedules, the technicians assigned, inspection and service reports, equipment details and readings, photos taken as proof of completed work, and the documents prepared for your job (for example quotations, contracts, checklists and turnover forms).',
          'Payment records: quotation totals, required deposits and the payments recorded against them. Payments themselves are made outside this system; we do not collect card or bank login details.',
          'Messages: support cases, chat messages and notifications exchanged with AFN.',
          'Security records: sign-in activity, including the date, your IP address and browser type, so we can protect accounts and investigate misuse.',
          'Technician location (AFN staff only): while a technician shares their location during a job, the system records their position to dispatch work and show progress to the office.',
        ]} />
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use your information',
    body: (
      <List items={[
        'To review, schedule and carry out your requests, inspections and installations.',
        'To prepare and keep your service documents, quotations, contracts and warranty records.',
        'To contact you about your account, appointments, changes and follow-up care.',
        'To keep accounts secure, verify email addresses and prevent misuse.',
        'To improve our service using summary figures (for example the number of jobs per month).',
      ]} />
    ),
  },
  {
    id: 'legal-basis',
    title: 'Why we may process it',
    body: (
      <p>
        We process personal information because it is needed to provide the service you ask for, to meet our obligations under
        Philippine law (including the Data Privacy Act of 2012, Republic Act No. 10173), for AFN's legitimate interest in running
        and securing its service, and, where required, with your consent, which you give when you create an account.
      </p>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <p>We do not sell your personal information. We share it only with:</p>
        <List items={[
          'AFN staff and technicians who need it to handle your job.',
          'Service providers that run parts of the system for us: cloud hosting for the application and its database, cloud file storage for photos and documents, and an email delivery service for account and appointment emails.',
          'Map and address-search services, when you search for or pin an address on the map.',
          'An optional AI analytics assistant used by AFN administrators. It receives summary business figures only, not client names, contact details or addresses.',
          'Government authorities, when the law requires it.',
        ]} />
        <p>These providers may store data outside the Philippines. We use them only for the purposes above and expect them to protect it.</p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <List items={[
        'Account details: while your account is active, and afterwards for as long as the related job records are kept.',
        'Job, document and payment records: as long as needed for warranty, after-sales service, accounting and legal requirements.',
        'Sign-ups that are never email-verified are deleted automatically, normally within one day.',
        'Technician location history: normally 30 days.',
        'Security records: as long as needed to protect the service and investigate incidents.',
      ]} />
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <List items={[
        'Connections to the system are encrypted (HTTPS).',
        'Passwords are stored in hashed form; staff accounts can use two-step sign-in.',
        'Each role (client, technician, administrator) can see only what it needs.',
        'Service documents and their source files are stored privately and are released only to signed-in, authorised users.',
      ]} />
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the Data Privacy Act you have the right to:</p>
        <List items={[
          'be informed about how your personal information is processed;',
          'access the personal information we hold about you;',
          'have inaccurate information corrected;',
          'object to processing, and ask for it to be blocked or erased, where the law allows;',
          'receive a copy of your information in a commonly used electronic format;',
          'be compensated for damages caused by unlawful processing; and',
          'file a complaint with the National Privacy Commission (privacy.gov.ph).',
        ]} />
        <p>
          You can update most account details yourself on your profile page. For anything else, contact our{' '}
          {PRIVACY_CONTACT.role} using the details below. Some records, such as completed job and payment records, may need to be
          kept even after you ask for deletion, when the law or a warranty requires it.
        </p>
      </>
    ),
  },
  {
    id: 'browser-storage',
    title: 'Cookies and browser storage',
    body: (
      <p>
        The system keeps your sign-in in your browser's session storage, which is cleared when you close the browser or sign out.
        It also remembers a few display preferences and keeps a short-lived copy of the public home page so it loads quickly.
        We do not use advertising or tracking cookies.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: <p>Accounts are meant for adults arranging service for a home, business or property. We do not knowingly collect information from children.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy. If a change affects how your information is used, we will ask you to agree to the new
        version.
      </p>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <PolicyLayout
      title="Privacy Policy"
      intro={`This policy explains what personal information ${PRIVACY_CONTACT.company} ("AFN", "we") collects through the AFN-SERVE system, how we use and protect it, and the choices and rights you have.`}
      sections={SECTIONS}
      otherPolicy={{ to: '/terms', label: 'Terms of Service' }}
    />
  );
}

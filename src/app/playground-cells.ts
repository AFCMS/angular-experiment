export type FieldValue = string | number | boolean | string[] | null;

export interface FieldDefinition {
  key: string;
  label: string;
  type:
    | 'text'
    | 'email'
    | 'url'
    | 'number'
    | 'date'
    | 'time'
    | 'textarea'
    | 'select'
    | 'multiselect'
    | 'checkbox'
    | 'toggle'
    | 'radio';
  initialValue: FieldValue;
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  suffix?: string;
  pattern?: string;
}

export interface CellDefinition {
  id: string;
  title: string;
  description: string;
  clearable?: boolean;
  fields: FieldDefinition[];
}

export const CELL_DEFINITIONS: CellDefinition[] = [
  {
    id: 'profile',
    title: 'Profile',
    description: 'Identity and account details',
    fields: [
      { key: 'name', label: 'Name', type: 'text', initialValue: 'Alex Morgan', required: true },
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        initialValue: 'alex@example.com',
        required: true,
      },
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        initialValue: 'Editor',
        options: ['Viewer', 'Editor', 'Admin'],
        required: true,
      },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace',
    description: 'Project location and environment',
    fields: [
      { key: 'name', label: 'Name', type: 'text', initialValue: 'Design studio', required: true },
      {
        key: 'region',
        label: 'Region',
        type: 'select',
        initialValue: 'Europe',
        options: [
          'Europe',
          'North America',
          'South America',
          'Asia Pacific',
          'Africa',
          'Middle East',
        ],
      },
      {
        key: 'environment',
        label: 'Environment',
        type: 'select',
        initialValue: 'Development',
        options: ['Development', 'Staging', 'Production'],
      },
      { key: 'private', label: 'Private workspace', type: 'toggle', initialValue: true },
    ],
  },
  {
    id: 'assignment',
    title: 'Assignment',
    description: 'Ownership, priority, and due date',
    clearable: true,
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        initialValue: 'Review component library',
        required: true,
      },
      {
        key: 'owner',
        label: 'Owner',
        type: 'select',
        initialValue: 'Alex',
        options: ['Alex', 'Sam', 'Jordan', 'Taylor'],
      },
      { key: 'due', label: 'Due date', type: 'date', initialValue: '2026-12-01', required: true },
      {
        key: 'priority',
        label: 'Priority',
        type: 'radio',
        initialValue: 'Normal',
        options: ['Low', 'Normal', 'High'],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Channels and delivery preferences',
    fields: [
      {
        key: 'channel',
        label: 'Channel',
        type: 'select',
        initialValue: 'Email',
        options: ['Email', 'In-app', 'Both'],
      },
      {
        key: 'frequency',
        label: 'Frequency',
        type: 'select',
        initialValue: 'Daily digest',
        options: ['Immediately', 'Daily digest', 'Weekly digest'],
      },
      { key: 'mentions', label: 'Notify me about mentions', type: 'checkbox', initialValue: true },
      { key: 'enabled', label: 'Notifications enabled', type: 'toggle', initialValue: true },
    ],
  },
  {
    id: 'schedule',
    title: 'Schedule',
    description: 'A date, time, and repeat interval',
    clearable: true,
    fields: [
      {
        key: 'start',
        label: 'Start date',
        type: 'date',
        initialValue: '2026-12-01',
        required: true,
      },
      { key: 'time', label: 'Start time', type: 'time', initialValue: '09:00', required: true },
      {
        key: 'repeat',
        label: 'Repeat',
        type: 'select',
        initialValue: 'Weekly',
        options: ['Never', 'Daily', 'Weekly', 'Monthly'],
      },
      {
        key: 'timezone',
        label: 'Time zone',
        type: 'select',
        initialValue: 'Europe/Paris',
        options: [
          'Europe/Paris',
          'Europe/London',
          'America/New_York',
          'America/Los_Angeles',
          'Asia/Tokyo',
          'Australia/Sydney',
        ],
      },
    ],
  },
  {
    id: 'limits',
    title: 'Usage limits',
    description: 'Numeric fields with units and bounds',
    fields: [
      {
        key: 'members',
        label: 'Members',
        type: 'number',
        initialValue: 12,
        min: 1,
        max: 100,
        required: true,
      },
      {
        key: 'storage',
        label: 'Storage',
        type: 'number',
        initialValue: 50,
        min: 1,
        max: 1000,
        suffix: 'GB',
        required: true,
      },
      {
        key: 'retention',
        label: 'Retention',
        type: 'number',
        initialValue: 30,
        min: 1,
        max: 365,
        suffix: 'days',
        required: true,
      },
      { key: 'alerts', label: 'Send limit alerts', type: 'checkbox', initialValue: true },
    ],
  },
  {
    id: 'access',
    title: 'Access rules',
    description: 'Permission scope and approval settings',
    fields: [
      {
        key: 'scope',
        label: 'Scope',
        type: 'select',
        initialValue: 'Team only',
        options: ['Just me', 'Team only', 'Organization', 'Public'],
      },
      {
        key: 'permission',
        label: 'Permission',
        type: 'radio',
        initialValue: 'Read',
        options: ['Read', 'Write'],
      },
      {
        key: 'approval',
        label: 'Require approval for changes',
        type: 'checkbox',
        initialValue: true,
      },
      { key: 'enabled', label: 'Access enabled', type: 'toggle', initialValue: true },
    ],
  },
  {
    id: 'filters',
    title: 'Saved filters',
    description: 'Search text and multiple selections',
    clearable: true,
    fields: [
      { key: 'query', label: 'Search', type: 'text', initialValue: 'Components' },
      {
        key: 'status',
        label: 'Status',
        type: 'multiselect',
        initialValue: ['Active', 'In review'],
        options: ['Draft', 'Active', 'In review', 'Approved', 'Archived'],
      },
      {
        key: 'tags',
        label: 'Tags',
        type: 'multiselect',
        initialValue: ['Design'],
        options: ['Design', 'Engineering', 'Product', 'Research', 'Support'],
      },
      { key: 'archived', label: 'Include archived items', type: 'checkbox', initialValue: false },
    ],
  },
  {
    id: 'connection',
    title: 'Connection',
    description: 'Endpoint configuration and retries',
    clearable: true,
    fields: [
      {
        key: 'endpoint',
        label: 'Endpoint',
        type: 'url',
        initialValue: 'https://api.example.com',
        required: true,
        pattern: 'https?://.+',
      },
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        initialValue: 'GET',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      },
      {
        key: 'timeout',
        label: 'Timeout',
        type: 'number',
        initialValue: 30,
        min: 1,
        max: 120,
        suffix: 'sec',
        required: true,
      },
      { key: 'retry', label: 'Retry failed requests', type: 'toggle', initialValue: true },
    ],
  },
  {
    id: 'export',
    title: 'Export options',
    description: 'File details and output format',
    fields: [
      {
        key: 'filename',
        label: 'File name',
        type: 'text',
        initialValue: 'workspace-report',
        required: true,
      },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        initialValue: 'CSV',
        options: ['CSV', 'JSON', 'XML', 'TSV'],
      },
      {
        key: 'encoding',
        label: 'Encoding',
        type: 'select',
        initialValue: 'UTF-8',
        options: ['UTF-8', 'UTF-16', 'ASCII'],
      },
      { key: 'headers', label: 'Include column headers', type: 'checkbox', initialValue: true },
    ],
  },
  {
    id: 'notes',
    title: 'Review notes',
    description: 'A multiline field and review metadata',
    clearable: true,
    fields: [
      {
        key: 'subject',
        label: 'Subject',
        type: 'text',
        initialValue: 'Weekly review',
        required: true,
      },
      {
        key: 'notes',
        label: 'Notes',
        type: 'textarea',
        initialValue: 'Check spacing, labels, and keyboard navigation.',
        required: true,
      },
      {
        key: 'reviewer',
        label: 'Reviewer',
        type: 'select',
        initialValue: 'Sam',
        options: ['Alex', 'Sam', 'Jordan', 'Taylor'],
      },
    ],
  },
  {
    id: 'preferences',
    title: 'Preferences',
    description: 'Language, date format, and start page',
    fields: [
      {
        key: 'language',
        label: 'Language',
        type: 'select',
        initialValue: 'English',
        options: ['English', 'French', 'German', 'Spanish', 'Italian', 'Portuguese'],
      },
      {
        key: 'dates',
        label: 'Date format',
        type: 'select',
        initialValue: 'DD/MM/YYYY',
        options: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      },
      {
        key: 'start',
        label: 'Start page',
        type: 'select',
        initialValue: 'Dashboard',
        options: ['Dashboard', 'Projects', 'Recent activity', 'Saved filters'],
      },
      {
        key: 'remember',
        label: 'Remember last visited page',
        type: 'checkbox',
        initialValue: true,
      },
    ],
  },
];

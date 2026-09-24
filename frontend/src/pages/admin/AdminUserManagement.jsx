import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiPlus, FiSearch, FiUserCheck, FiUsers } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import {
  api,
  createAdminClient,
  createAdminTechnician,
  createAdminUser,
  deactivateAdminUser,
  deleteAdminClient,
  deleteAdminTechnician,
  fetchAllPages,
  fetchAdminTechnician,
  fetchAdminUsers,
  fetchAssignableCapabilities,
  fetchUserCapabilities,
  updateAdminClient,
  updateAdminTechnician,
  updateAdminUser,
  updateUserCapabilities
} from '../../api/api';
import {
  CAPABILITIES,
  USER_DIRECTORY_CAPABILITIES,
  USER_MANAGEMENT_CAPABILITIES,
  canManageStaffAccess,
  canManageStaffTargetRole,
  hasAnyCapability
} from '../../rbac';
import { formatRoleId } from '../../utils/roleIds';

const ROLE_SECTIONS = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'admin', label: 'Administrators' },
  { value: 'technician', label: 'Technicians' },
  { value: 'client', label: 'Clients' }
];
const CREATE_ROLE_SECTIONS = ROLE_SECTIONS.filter((section) => section.value !== 'superadmin');
const ACCESS_AREA_DEFINITIONS = [
  {
    roles: ['admin', 'superadmin'],
    label: 'Dashboard',
    capabilities: [CAPABILITIES.adminOperationsDashboardView, CAPABILITIES.afterSalesDashboardView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Tickets',
    capabilities: [CAPABILITIES.adminTicketsView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Dispatch',
    capabilities: [CAPABILITIES.adminDispatchView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Tracking',
    capabilities: [CAPABILITIES.adminTrackingView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'After Sales',
    capabilities: [
      CAPABILITIES.afterSalesDashboardView,
      CAPABILITIES.afterSalesCasesView,
      CAPABILITIES.afterSalesCasesManage
    ]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Job History',
    capabilities: [CAPABILITIES.adminJobHistoryView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'User Directory',
    capabilities: [CAPABILITIES.userDirectoryView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Access Control',
    capabilities: [CAPABILITIES.manageStaffCapabilities]
  },
  {
    roles: ['technician'],
    label: 'Dashboard',
    capabilities: [CAPABILITIES.technicianDashboardView]
  },
  {
    roles: ['technician'],
    label: 'Jobs',
    capabilities: [CAPABILITIES.technicianJobsView]
  },
  {
    roles: ['technician'],
    label: 'Schedule',
    capabilities: [CAPABILITIES.technicianScheduleView]
  },
  {
    roles: ['technician'],
    label: 'Navigation',
    capabilities: [CAPABILITIES.technicianNavigationView]
  },
  {
    roles: ['technician'],
    label: 'Checklist',
    capabilities: [CAPABILITIES.technicianChecklistView]
  },
  {
    roles: ['technician'],
    label: 'Messages',
    capabilities: [CAPABILITIES.technicianMessagesView]
  },
  {
    roles: ['technician'],
    label: 'History',
    capabilities: [CAPABILITIES.technicianHistoryView]
  },
  {
    roles: ['technician'],
    label: 'Profile',
    capabilities: [CAPABILITIES.technicianProfileView]
  }
];
const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500';
const panelClass = 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm';
const ITEMS_PER_PAGE = 10;
const emptyCreate = { username: '', name: '', role: 'technician', email: '', phone: '', address: '', status: 'available', password: '', passwordConfirm: '' };
const emptyEdit = { name: '', email: '', phone: '', address: '', status: 'available', lat: '', lng: '', skills: [] };
const emptySkillEntry = { service_type: '', skill_level: 'intermediate' };
const SKILL_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' }
];

const getRoleLabel = (role) => ROLE_SECTIONS.find((section) => section.value === role)?.label || role || 'Unknown';
const getEntityLabel = (role) => (role === 'technician' ? 'Technician' : role === 'client' ? 'Client' : role === 'admin' ? 'Administrator' : 'User');
const isHardDeleteRole = (role) => false;
const getAllowedRoleFilter = (canViewAllUsers, search) => {
  const requested = new URLSearchParams(search).get('role');
  const allowed = canViewAllUsers ? ['all', ...ROLE_SECTIONS.map((section) => section.value)] : ['technician'];
  return allowed.includes(requested) ? requested : (canViewAllUsers ? 'all' : 'technician');
};
const getTechnicianStatusLabel = (status) => (status === 'available' ? 'Available' : status === 'on_job' ? 'On job' : 'Offline');
const sanitizeCapabilities = (capabilities = [], availableCapabilities = []) => {
  const allowedCapabilities = new Set((availableCapabilities || []).map((item) => item.code));
  return capabilities.filter((capability) => allowedCapabilities.has(capability));
};
const matchesSearch = (user, query) => !query || [
  user.username,
  user.first_name,
  user.last_name,
  user.name,
  user.email,
  user.phone,
  user.address,
  user.role,
  getRoleLabel(user.role),
  user.role === 'technician' ? getTechnicianStatusLabel(user.technicianStatus) : '',
  user.active ? 'active' : 'inactive'
].some((value) => String(value || '').toLowerCase().includes(query));
const getFullName = (user) => [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || '-';
const getAddressSummary = (user) => user.address || 'No address on file';
const getAccessAreas = (record) => {
  if (record.role === 'superadmin') return ['All areas'];
  const capabilitySet = new Set(record.capabilities || []);
  return ACCESS_AREA_DEFINITIONS
    .filter((area) => area.roles.includes(record.role) && area.capabilities.some((capability) => capabilitySet.has(capability)))
    .map((area) => area.label);
};
const groupCapabilitiesByCategory = (capabilities = []) => capabilities.reduce((groups, capability) => {
  const category = capability.category || 'General';
  return {
    ...groups,
    [category]: [...(groups[category] || []), capability]
  };
}, {});

export default function AdminUserManagement() {
  const location = useLocation();
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const canViewAllUsers = isSuperadmin || (user?.role === 'admin' && hasAnyCapability(user, USER_DIRECTORY_CAPABILITIES));
  const canManageUsers = isSuperadmin || (user?.role === 'admin' && hasAnyCapability(user, USER_MANAGEMENT_CAPABILITIES));
  const allowCapabilityManagement = canManageStaffAccess(user);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [availableServiceTypes, setAvailableServiceTypes] = useState([]);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState(() => getAllowedRoleFilter(canViewAllUsers, location.search));
  const [currentPage, setCurrentPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProfileUser, setEditingProfileUser] = useState(null);
  const [editingAccessUser, setEditingAccessUser] = useState(null);
  const [viewingAccessUser, setViewingAccessUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingCapabilities, setEditingCapabilities] = useState([]);
  const [busyUserId, setBusyUserId] = useState(null);
  const [loadingProfileUserId, setLoadingProfileUserId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3500);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const load = async ({ preserveFeedback = false } = {}) => {
    setLoading(true);
    try {
      const fetchedUsers = await fetchAdminUsers();
      setUsers([...fetchedUsers].sort((left, right) => Number(right.id || 0) - Number(left.id || 0)));
      if (!preserveFeedback) {
        setMessage('');
        setError('');
      }
    } catch (loadError) {
      setUsers([]);
      if (!preserveFeedback) setMessage('');
      setError(loadError.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setRoleFilter(getAllowedRoleFilter(canViewAllUsers, location.search)); }, [canViewAllUsers, location.search]);
  useEffect(() => { setCurrentPage(1); }, [roleFilter, searchTerm, showInactive]);
  useEffect(() => {
    let isMounted = true;
    fetchAllPages('/services/service-types/').then((data) => {
      if (!isMounted) return;
      const serviceTypes = Array.isArray(data) ? data : [];
      setAvailableServiceTypes(
        [...serviceTypes].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')))
      );
    }).catch(() => {
      if (isMounted) setAvailableServiceTypes([]);
    });
    return () => { isMounted = false; };
  }, []);
  useEffect(() => {
    let isMounted = true;
    if (!allowCapabilityManagement) {
      setCatalog([]);
      return () => { isMounted = false; };
    }
    fetchAssignableCapabilities().then((capabilities) => {
      if (isMounted) setCatalog(Array.isArray(capabilities) ? capabilities : []);
    }).catch(() => {
      if (isMounted) setCatalog([]);
    });
    return () => { isMounted = false; };
  }, [allowCapabilityManagement]);

  const filteredByAccess = useMemo(
    () => (canViewAllUsers ? users : users.filter((record) => canManageStaffTargetRole(record.role))),
    [canViewAllUsers, users]
  );
  const scopedUsers = useMemo(
    () => filteredByAccess.filter((record) => (showInactive ? !record.active : record.active)),
    [filteredByAccess, showInactive]
  );
  const inactiveCount = useMemo(
    () => filteredByAccess.filter((record) => !record.active).length,
    [filteredByAccess]
  );
  const roleCounts = useMemo(
    () => ROLE_SECTIONS.reduce((counts, section) => ({
      ...counts,
      [section.value]: scopedUsers.filter((record) => record.role === section.value).length
    }), {}),
    [scopedUsers]
  );
  const visibleUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return scopedUsers.filter((record) => (
      (roleFilter === 'all' || record.role === roleFilter) && matchesSearch(record, normalizedSearch)
    ));
  }, [roleFilter, scopedUsers, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedUsers = visibleUsers.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
  const capabilityGroups = useMemo(() => groupCapabilitiesByCategory(catalog), [catalog]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const canManageAccessTarget = (role) => isSuperadmin
    ? ['admin'].includes(role)
    : false;

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!canManageUsers) return;
    setMessage('');
    setError('');
    if (!createForm.username.trim()) return setError('Username is required.');
    if (!createForm.password) return setError('Password is required.');
    if (createForm.password !== createForm.passwordConfirm) return setError('Passwords do not match.');
    const basePayload = { username: createForm.username, name: createForm.name, role: createForm.role, email: createForm.email, phone: createForm.phone, password: createForm.password, passwordConfirm: createForm.passwordConfirm };
    setIsSubmitting(true);
    try {
      if (createForm.role === 'technician') await createAdminTechnician({ ...basePayload, status: createForm.status });
      else if (createForm.role === 'client') await createAdminClient({ ...basePayload, address: createForm.address });
      else await createAdminUser(basePayload);
      setCreateForm(emptyCreate);
      setShowCreateForm(false);
      setMessage(`${getEntityLabel(createForm.role)} created.`);
      await load({ preserveFeedback: true });
    } catch (createError) {
      setError(createError.message || 'Failed to create user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openProfileEditor = async (record) => {
    setMessage('');
    setError('');
    setLoadingProfileUserId(record.id);
    try {
      const resolvedRecord = record.role === 'technician'
        ? await fetchAdminTechnician(record.id)
        : record;
      setEditingProfileUser(resolvedRecord);
      setEditForm({
        ...emptyEdit,
        name: resolvedRecord.name || '',
        email: resolvedRecord.email || '',
        phone: resolvedRecord.phone || '',
        address: resolvedRecord.address || '',
        status: resolvedRecord.role === 'technician' ? resolvedRecord.technicianStatus || 'available' : 'available',
        lat: resolvedRecord.lat || '',
        lng: resolvedRecord.lng || '',
        skills: resolvedRecord.role === 'technician'
          ? (Array.isArray(resolvedRecord.skillDetails) && resolvedRecord.skillDetails.length > 0
              ? resolvedRecord.skillDetails.map((skill) => ({
                  service_type: String(skill.service_type),
                  skill_level: skill.skill_level || 'intermediate'
                }))
              : [])
          : [],
      });
    } catch (loadError) {
      setEditingProfileUser(null);
      setEditForm(emptyEdit);
      setError(loadError.message || 'Unable to load user details.');
    } finally {
      setLoadingProfileUserId(null);
    }
  };

  const saveProfile = async () => {
    if (!editingProfileUser || !canManageUsers) return;
    const technicianSkills = editingProfileUser.role === 'technician'
      ? (Array.isArray(editForm.skills) ? editForm.skills : [])
      : [];
    if (editingProfileUser.role === 'technician') {
      const seenServiceTypes = new Set();
      for (let index = 0; index < technicianSkills.length; index += 1) {
        const skill = technicianSkills[index];
        const serviceTypeId = String(skill?.service_type || '').trim();
        if (!serviceTypeId) {
          setError(`Select a service type for skill #${index + 1}.`);
          return;
        }
        if (seenServiceTypes.has(serviceTypeId)) {
          setError('Each service type can only be assigned once per technician.');
          return;
        }
        seenServiceTypes.add(serviceTypeId);
      }
    }
    const updates = { name: editForm.name, email: editForm.email, phone: editForm.phone, active: editingProfileUser.active };
    setIsSavingProfile(true);
    setMessage('');
    setError('');
    try {
      if (editingProfileUser.role === 'technician') {
        await updateAdminTechnician(editingProfileUser.id, {
          ...updates,
          status: editForm.status,
          lat: editForm.lat,
          lng: editForm.lng,
          skills: technicianSkills.map((skill) => ({
            service_type: Number(skill.service_type),
            skill_level: skill.skill_level || 'intermediate'
          }))
        });
      }
      else if (editingProfileUser.role === 'client') await updateAdminClient(editingProfileUser.id, { ...updates, address: editForm.address });
      else await updateAdminUser(editingProfileUser.id, updates);
      setEditingProfileUser(null);
      setEditForm(emptyEdit);
      setMessage(`${getEntityLabel(editingProfileUser.role)} updated.`);
      await load({ preserveFeedback: true });
    } catch (saveError) {
      setError(saveError.message || 'Unable to update user.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const addSkillRow = () => {
    setEditForm((current) => ({
      ...current,
      skills: [...(Array.isArray(current.skills) ? current.skills : []), { ...emptySkillEntry }]
    }));
  };

  const updateSkillRow = (index, field, value) => {
    setEditForm((current) => ({
      ...current,
      skills: (Array.isArray(current.skills) ? current.skills : []).map((skill, skillIndex) => (
        skillIndex === index
          ? { ...skill, [field]: value }
          : skill
      ))
    }));
  };

  const removeSkillRow = (index) => {
    setEditForm((current) => ({
      ...current,
      skills: (Array.isArray(current.skills) ? current.skills : []).filter((_, skillIndex) => skillIndex !== index)
    }));
  };

  const removeUser = async (record) => {
    if (!canManageUsers) return;
    if (!record.active) return;
    const hardDelete = isHardDeleteRole(record.role);
    setBusyUserId(record.id);
    setMessage('');
    setError('');
    try {
      if (record.role === 'technician') {
        await deleteAdminTechnician(record.id);
        setMessage('Technician deactivated.');
      } else if (record.role === 'client') {
        await deleteAdminClient(record.id);
        setMessage('Client deactivated.');
      } else {
        await deactivateAdminUser(record.id);
        setMessage(`${getEntityLabel(record.role)} deactivated.`);
      }
      if (editingProfileUser?.id === record.id) setEditingProfileUser(null);
      if (editingAccessUser?.id === record.id) setEditingAccessUser(null);
      if (viewingAccessUser?.id === record.id) setViewingAccessUser(null);
      if (deleteTarget?.id === record.id) setDeleteTarget(null);
      await load({ preserveFeedback: true });
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove user.');
    } finally {
      setBusyUserId(null);
    }
  };

  const openAccessEditor = async (record) => {
    if (!allowCapabilityManagement || !canManageAccessTarget(record.role)) return;
    setViewingAccessUser(null);
    setBusyUserId(record.id);
    setMessage('');
    setError('');
    try {
      const accessData = await fetchUserCapabilities(record.id);
      if (Array.isArray(accessData.available_capabilities) && accessData.available_capabilities.length > 0) setCatalog(accessData.available_capabilities);
      setEditingAccessUser(record);
      const currentCapabilities = Array.isArray(accessData.direct_capabilities) && accessData.direct_capabilities.length > 0
        ? accessData.direct_capabilities
        : accessData.effective_capabilities || [];
      setEditingCapabilities(sanitizeCapabilities(currentCapabilities, accessData.available_capabilities || []));
    } catch (accessError) {
      setError(accessError.message || 'Unable to load user access.');
    } finally {
      setBusyUserId(null);
    }
  };

  const saveAccess = async () => {
    if (!editingAccessUser) return;
    setIsSavingAccess(true);
    setMessage('');
    setError('');
    try {
      const payload = sanitizeCapabilities(editingCapabilities, catalog);
      await updateUserCapabilities(editingAccessUser.id, payload);
      setEditingAccessUser(null);
      setEditingCapabilities([]);
      setMessage(`Access updated for ${editingAccessUser.username}.`);
      await load({ preserveFeedback: true });
    } catch (saveError) {
      setError(saveError.message || 'Unable to update user access.');
    } finally {
      setIsSavingAccess(false);
    }
  };

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {message ? (
            <div className="fixed left-1/2 top-6 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-800 shadow-xl ring-1 ring-black/5">
              <FiUserCheck className="h-5 w-5 text-emerald-500" />
              {message}
            </div>
          ) : null}
          {canManageUsers ? (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <FiPlus size={16} />
              New User
            </button>
          ) : null}
        </div>
      </div>
      {error ? <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}
      {canManageUsers && showCreateForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" onClick={() => { if (!isSubmitting) setShowCreateForm(false); }}>
          <form onSubmit={handleCreate} className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <FiUserCheck />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">Create user</h3>
                </div>
              </div>
              <button type="button" disabled={isSubmitting} onClick={() => setShowCreateForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
                <input className={inputClass} value={createForm.username} onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Full name</span>
                <input className={inputClass} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Role</span>
                <select className={inputClass} value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}>
                  {CREATE_ROLE_SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
                <input type="email" className={inputClass} value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
                <input className={inputClass} value={createForm.phone} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })} />
              </label>
              {createForm.role === 'client' ? (
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Address</span>
                  <input className={inputClass} value={createForm.address} onChange={(event) => setCreateForm({ ...createForm, address: event.target.value })} />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
                <input type="password" className={inputClass} value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Confirm password</span>
                <input type="password" className={inputClass} value={createForm.passwordConfirm} onChange={(event) => setCreateForm({ ...createForm, passwordConfirm: event.target.value })} />
              </label>
            </div>
            <div className="sticky bottom-0 mt-5 flex justify-end border-t border-slate-200 bg-white pt-4">
              <button type="submit" disabled={isSubmitting} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={`${panelClass} mb-6`}>
        <div className="space-y-4">
          {canViewAllUsers ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Category</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRoleFilter('all')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${roleFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>All ({scopedUsers.length})</button>
                {ROLE_SECTIONS.map((section) => {
                  const count = roleCounts[section.value] || 0;
                  return <button key={section.value} type="button" onClick={() => setRoleFilter(section.value)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${roleFilter === section.value ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>{section.label} ({count})</button>;
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">Technician accounts available: <span className="font-semibold text-slate-900">{scopedUsers.filter((record) => record.role === 'technician').length}</span></div>
          )}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Search users</label>
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-9 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                placeholder="Name, username, email, phone, role, address, or status"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <FiUsers size={15} />
            <span>Showing {visibleUsers.length} {showInactive ? 'inactive' : 'active'} user{visibleUsers.length === 1 ? '' : 's'}{roleFilter === 'all' ? ' across all roles.' : ` in ${getRoleLabel(roleFilter)}.`}</span>
          </p>
          {canManageUsers && inactiveCount > 0 ? (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Show inactive accounts ({inactiveCount})
            </label>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className={`${panelClass} p-0`}>
          <TableSkeleton rows={8} columns={7} />
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className={panelClass}>No users match the current search or selected category.</div>
      ) : (
        <div className={`${panelClass} overflow-hidden p-0`}>
          <div className="overflow-x-auto w-full">
            <div className="min-w-[1040px] max-h-[68vh] overflow-y-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className={`${canManageUsers ? 'w-[22%]' : 'w-[25%]'} border-b border-slate-200 px-3 py-3`}>User</th>
                  <th className="w-[10%] border-b border-slate-200 px-3 py-3">Role</th>
                  <th className={`${canManageUsers ? 'w-[18%]' : 'w-[22%]'} border-b border-slate-200 px-3 py-3`}>Address</th>
                  <th className={`${canManageUsers ? 'w-[20%]' : 'w-[24%]'} border-b border-slate-200 px-3 py-3`}>Contact</th>
                  <th className={`${canManageUsers ? 'w-[13%]' : 'w-[12%]'} border-b border-slate-200 px-3 py-3`}>Access</th>
                  <th className="w-[8%] border-b border-slate-200 px-3 py-3">Status</th>
                  {canManageUsers ? <th className="w-[12%] min-w-[128px] border-b border-slate-200 px-3 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((record) => {
                  const canEditAccess = allowCapabilityManagement && canManageAccessTarget(record.role);
                  const hardDelete = false;
                  const canRemove = canManageUsers && record.id !== user?.id && record.active;
                  const removeLabel = 'Deactivate';
                  const busyRemoveLabel = 'Deactivating...';
                  const accessAreas = getAccessAreas(record);
                  return (
                    <tr key={record.id} className="bg-white transition hover:bg-brand-50/40">
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900" title={getFullName(record)}>{getFullName(record)}</div>
                          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] leading-4">
                            <span className="shrink-0 font-semibold text-brand-700">{formatRoleId(record.role, record.id)}</span>
                            <span className="min-w-0 truncate text-slate-500" title={record.username}>@{record.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{getRoleLabel(record.role)}</span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle text-slate-600">
                        <div className="line-clamp-2">{getAddressSummary(record)}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle text-slate-600">
                        <div className="min-w-0">
                          <div className="truncate" title={record.email || ''}>{record.email || '-'}</div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500" title={record.phone || ''}>{record.phone || '-'}</div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        {canEditAccess ? (
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => setViewingAccessUser(record)} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">
                              Areas ({accessAreas.length})
                            </button>
                            <button type="button" disabled={busyUserId === record.id} onClick={() => openAccessEditor(record)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                              {busyUserId === record.id && editingAccessUser?.id !== record.id ? 'Loading...' : 'Manage'}
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setViewingAccessUser(record)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                            {accessAreas.length === 0 ? (canViewAllUsers ? 'Read only' : 'Technician only') : `Areas (${accessAreas.length})`}
                          </button>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle"><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${record.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{record.active ? 'Active' : 'Inactive'}</span></td>
                      {canManageUsers ? (
                        <td className="min-w-[128px] border-b border-slate-100 px-3 py-2 align-middle text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            <button
                              type="button"
                              disabled={loadingProfileUserId === record.id}
                              onClick={() => openProfileEditor(record)}
                              className="min-w-[76px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {loadingProfileUserId === record.id ? 'Loading...' : 'Edit'}
                            </button>
                            {canRemove ? (
                              <button type="button" disabled={busyUserId === record.id} onClick={() => setDeleteTarget(record)} className="min-w-[76px] rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">{busyUserId === record.id ? busyRemoveLabel : removeLabel}</button>
                            ) : record.role === 'superadmin' ? (
                              <span className="text-sm text-slate-400">Owner account</span>
                            ) : <span className="text-sm text-slate-400">Inactive</span>}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          {visibleUsers.length > ITEMS_PER_PAGE && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm">
              <span className="text-slate-500">
                Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + ITEMS_PER_PAGE, visibleUsers.length)} of {visibleUsers.length} users
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safeCurrentPage === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-slate-500">Page {safeCurrentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {viewingAccessUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" onClick={() => setViewingAccessUser(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Accessible areas</h3>
                <p className="text-sm text-slate-500">{viewingAccessUser.username} can access these areas.</p>
              </div>
              <button type="button" onClick={() => setViewingAccessUser(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Close</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {getAccessAreas(viewingAccessUser).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 sm:col-span-2">No granted areas.</div>
              ) : (
                getAccessAreas(viewingAccessUser).map((area) => (
                  <div key={area} className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                    {area}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
      {editingProfileUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" onClick={() => { if (!isSavingProfile) { setEditingProfileUser(null); setEditForm(emptyEdit); } }}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Edit {getEntityLabel(editingProfileUser.role)}</h3>
                <p className="text-sm text-slate-500">{editingProfileUser.username} stays on the same role and route.</p>
              </div>
              <button type="button" onClick={() => { setEditingProfileUser(null); setEditForm(emptyEdit); }} disabled={isSavingProfile} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Close</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input className={`${inputClass} bg-slate-50 text-slate-500`} value={editingProfileUser.username} disabled />
              <input className={`${inputClass} bg-slate-50 text-slate-500`} value={getRoleLabel(editingProfileUser.role)} disabled />
              <input className={inputClass} placeholder="Full name" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
              <input className={inputClass} placeholder="Email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
              <input className={inputClass} placeholder="Phone" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} />
              {editingProfileUser.role === 'technician' ? (
                <select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  <option value="available">Available</option>
                  <option value="on_job">On job</option>
                  <option value="offline">Offline</option>
                </select>
              ) : null}
              {editingProfileUser.role === 'client' ? (
                <input className={`${inputClass} md:col-span-2`} placeholder="Address" value={editForm.address} onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} />
              ) : null}
              {editingProfileUser.role === 'technician' ? (
                <>
                  <input type="number" className={inputClass} placeholder="Latitude" value={editForm.lat} onChange={(event) => setEditForm({ ...editForm, lat: event.target.value })} />
                  <input type="number" className={inputClass} placeholder="Longitude" value={editForm.lng} onChange={(event) => setEditForm({ ...editForm, lng: event.target.value })} />
                </>
              ) : null}
            </div>
            {editingProfileUser.role === 'technician' ? (
              <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Technician skills</h4>
                    <p className="text-sm text-slate-500">Only the superadmin can change these skills here. Old tickets stay untouched because this updates the technician&apos;s current skill records only.</p>
                  </div>
                  <button type="button" onClick={addSkillRow} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    Add skill
                  </button>
                </div>
                {editForm.skills.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No skills assigned yet.</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {editForm.skills.map((skill, index) => (
                      <div key={`${skill.service_type || 'new'}-${index}`} className="grid gap-3 md:grid-cols-[1.6fr_1fr_auto]">
                        <select className={inputClass} value={skill.service_type} onChange={(event) => updateSkillRow(index, 'service_type', event.target.value)}>
                          <option value="">Select service type</option>
                          {availableServiceTypes.map((serviceType) => (
                            <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>
                          ))}
                        </select>
                        <select className={inputClass} value={skill.skill_level} onChange={(event) => updateSkillRow(index, 'skill_level', event.target.value)}>
                          {SKILL_LEVEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => removeSkillRow(index)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div className="sticky bottom-0 mt-5 flex justify-end border-t border-slate-200 bg-white pt-4">
              <button type="button" onClick={saveProfile} disabled={isSavingProfile} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {isSavingProfile ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" onClick={() => { if (busyUserId !== deleteTarget.id) setDeleteTarget(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">
              {isHardDeleteRole(deleteTarget.role) ? 'Delete user?' : 'Deactivate user?'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {isHardDeleteRole(deleteTarget.role)
                ? `This will permanently delete ${getFullName(deleteTarget) !== '-' ? getFullName(deleteTarget) : deleteTarget.username}.`
                : `This will deactivate ${getFullName(deleteTarget) !== '-' ? getFullName(deleteTarget) : deleteTarget.username} and remove their active access.`}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={busyUserId === deleteTarget.id} onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                Cancel
              </button>
              <button type="button" disabled={busyUserId === deleteTarget.id} onClick={() => removeUser(deleteTarget)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                {busyUserId === deleteTarget.id ? (isHardDeleteRole(deleteTarget.role) ? 'Deleting...' : 'Deactivating...') : (isHardDeleteRole(deleteTarget.role) ? 'Delete' : 'Deactivate')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingAccessUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" onClick={() => { setEditingAccessUser(null); setEditingCapabilities([]); }}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Capabilities for {getRoleLabel(editingAccessUser.role)}</h3>
                <p className="text-sm text-slate-500">Select which capabilities {editingAccessUser.username} can access.</p>
              </div>
              <button type="button" onClick={() => { setEditingAccessUser(null); setEditingCapabilities([]); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Close</button>
            </div>
            <div className="space-y-5">
              {Object.entries(capabilityGroups).map(([category, capabilities]) => (
                <section key={category}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">{category}</h4>
                    <span className="text-xs font-medium text-slate-500">
                      {capabilities.filter((capability) => editingCapabilities.includes(capability.code)).length}/{capabilities.length} selected
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {capabilities.map((capability) => (
                      <label key={capability.code} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${editingCapabilities.includes(capability.code) ? 'border-slate-900 bg-slate-900/5 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={editingCapabilities.includes(capability.code)} onChange={() => setEditingCapabilities((current) => current.includes(capability.code) ? current.filter((item) => item !== capability.code) : [...current, capability.code])} className="mt-1" />
                        <span>
                          <span className="block font-semibold text-slate-900">{capability.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{capability.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {catalog.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No capabilities are available for this account.</div>
            ) : null}
            <div className="sticky bottom-0 mt-5 flex justify-end border-t border-slate-200 bg-white pt-4">
              <button type="button" onClick={saveAccess} disabled={isSavingAccess} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {isSavingAccess ? 'Saving access...' : 'Save access'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

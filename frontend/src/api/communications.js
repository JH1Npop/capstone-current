import { api, getApiErrorMessage } from './core';

const normalizeMessage = (message) => ({
  ...message,
  text: message.text || message.message_text || '',
  imageUrl: message.image_url || message.image || '',
  isDeleted: Boolean(message.is_deleted || message.isDeleted),
  editedAt: message.edited_at || message.editedAt || null,
  deletedAt: message.deleted_at || message.deletedAt || null,
  updatedAt: message.updated_at || message.updatedAt || null,
  timestamp: message.timestamp || message.created_at,
  roomType: message.room_type || message.roomType || 'direct',
  groupKey: message.group_key || message.groupKey || '',
  senderId: message.sender,
  senderName: message.sender_name || String(message.sender || ''),
  senderPhone: message.sender_phone || '',
  receiverId: message.receiver,
  receiverName: message.receiver_name || String(message.receiver || ''),
  receiverPhone: message.receiver_phone || '',
  ticketId: message.ticket_id || message.ticket || null,
  ticketAddress: message.ticket_address || '',
  ticketLatitude: message.ticket_latitude == null ? null : Number(message.ticket_latitude),
  ticketLongitude: message.ticket_longitude == null ? null : Number(message.ticket_longitude),
});

export const fetchMessages = async (role, username) => {
  try {
    const { data } = await api.get('/messages/', { params: { role, username } });
    const messageArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(messageArray) ? messageArray.map(normalizeMessage) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load messages.'));
  }
};

export const sendMessage = async (messageData) => {
  try {
    const roomType = messageData.roomType ?? messageData.room_type ?? 'direct';
    const text = messageData.text ?? messageData.message_text ?? '';
    const image = messageData.image ?? null;
    const payload = new FormData();
    payload.append('room_type', roomType);
    const groupKey = messageData.groupKey ?? messageData.group_key;
    const receiver = messageData.receiverId ?? messageData.receiver;
    const ticket = messageData.ticketId ?? messageData.ticket;
    if (groupKey) payload.append('group_key', groupKey);
    if (roomType !== 'group' && receiver) payload.append('receiver', receiver);
    if (ticket) payload.append('ticket', ticket);
    payload.append('text', text);
    if (image) payload.append('image', image);

    if (roomType !== 'group' && !messageData.receiverId && !messageData.receiver) {
      throw new Error('A message receiver is required.');
    }
    if (!String(text).trim() && !image) {
      throw new Error('Add a message or attach an image.');
    }

    const { data } = await api.post('/messages/', payload);
    return normalizeMessage(data);
  } catch (error) {
    if (error instanceof Error && !error.response) {
      throw error;
    }
    throw new Error(getApiErrorMessage(error, 'Unable to send message.'));
  }
};

export const updateMessage = async (messageId, updates) => {
  try {
    const payload = new FormData();
    payload.append('text', updates.text ?? '');
    if (updates.image) payload.append('image', updates.image);
    const { data } = await api.patch(`/messages/${messageId}/`, payload);
    return normalizeMessage(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to edit message.'));
  }
};

export const unsendMessage = async (messageId) => {
  try {
    const { data } = await api.delete(`/messages/${messageId}/`);
    return normalizeMessage(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to unsend message.'));
  }
};

export const fetchCustomerSupportCases = async () => {
  try {
    const { data } = await api.get('/messages/support-cases/');
    return Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load customer support cases.'));
  }
};

export const createCustomerSupportCase = async (caseData) => {
  try {
    const { data } = await api.post('/messages/support-cases/', {
      subject: caseData.subject,
      category: caseData.category,
      priority: caseData.priority,
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create customer support case.'));
  }
};

export const updateCustomerSupportCase = async (caseId, updates) => {
  try {
    const { data } = await api.patch(`/messages/support-cases/${caseId}/`, updates);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update customer support case.'));
  }
};

export const fetchMessageParticipants = async () => {
  try {
    const { data } = await api.get('/messages/participants/');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load message participants.'));
  }
};

export const fetchNotifications = async () => {
  try {
    const { data } = await api.get('/notifications/');
    const notifArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(notifArray) ? notifArray : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load notifications.'));
  }
};

export const markNotificationAsRead = async (notificationId) => {
  try {
    const { data } = await api.post(`/notifications/${notificationId}/mark_read/`);
    return data;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404 || status === 410) {
      return { status: 'noop', detail: 'Notification not found.' };
    }
    throw new Error(getApiErrorMessage(error, 'Unable to mark notification as read.'));
  }
};

export const markAllNotificationsAsRead = async () => {
  try {
    const { data } = await api.post('/notifications/mark_all_read/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to mark all notifications as read.'));
  }
};

export const deleteAllNotifications = async () => {
  try {
    const { data } = await api.delete('/notifications/delete_all/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete all notifications.'));
  }
};

export const getUnreadNotificationCount = async () => {
  try {
    const { data } = await api.get('/notifications/unread_count/');
    return data.unread_count || 0;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load unread notification count.'));
  }
};

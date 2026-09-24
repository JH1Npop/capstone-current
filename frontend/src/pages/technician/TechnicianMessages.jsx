import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import {
  fetchMessageParticipants,
  fetchMessages,
  sendMessage,
  unsendMessage,
  updateMessage,
} from '../../api/api';
import { FiArrowLeft, FiDownload, FiEdit2, FiImage, FiSend, FiTrash2, FiUsers, FiX } from 'react-icons/fi';
import { formatTicketId } from '../../utils/roleIds';

const STAFF_GROUP_ROOM = {
  key: 'group:staff',
  roomType: 'group',
  groupKey: 'staff',
  name: 'Staff Group Chat',
  subtitle: 'Admins, superadmins, and technicians',
  avatar: 'SG'
};

const roleLabel = (role) => {
  if (role === 'superadmin') return 'Superadmin';
  if (role === 'admin') return 'Admin';
  if (role === 'technician') return 'Technician';
  return 'Staff';
};

const initials = (name) =>
  String(name || 'Staff')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S';

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const getRoomKeyForMessage = (message, currentUserId) => {
  if (message.roomType === 'group') {
    return `group:${message.groupKey || 'staff'}`;
  }

  const partnerId = message.senderId === currentUserId ? message.receiverId : message.senderId;
  return `direct:${partnerId}`;
};

const getGroupRoomName = (message) => {
  if (message.groupKey === 'staff') return 'Staff Group Chat';
  if (message.groupKey?.startsWith('after_sales_ticket_')) {
    return `After-sales ${formatTicketId(message.ticketId)}`;
  }
  return message.groupKey || 'Group Chat';
};

export default function TechnicianMessages() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [selectedRoomKey, setSelectedRoomKey] = useState(STAFF_GROUP_ROOM.key);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [confirmUnsendMessage, setConfirmUnsendMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef(null);
  const imageInputRef = useRef(null);

  const rooms = useMemo(() => {
    const directRooms = participants.map((participant) => ({
      key: `direct:${participant.id}`,
      roomType: 'direct',
      participantId: participant.id,
      name: participant.name || participant.username || 'Staff',
      subtitle: roleLabel(participant.role),
      avatar: initials(participant.name || participant.username),
    }));
    const groupRooms = messages
      .filter((message) => (
        message.roomType === 'group' &&
        message.groupKey &&
        message.groupKey !== 'staff' &&
        !message.groupKey.startsWith('customer_support_client_')
      ))
      .reduce((roomsByKey, message) => {
        const key = `group:${message.groupKey}`;
        if (!roomsByKey.has(key)) {
          roomsByKey.set(key, {
            key,
            roomType: 'group',
            groupKey: message.groupKey,
            ticketId: message.ticketId,
            name: getGroupRoomName(message),
            subtitle: message.ticketAddress || 'Ticket conversation',
            avatar: 'AS',
          });
        }
        return roomsByKey;
      }, new Map());

    const allRooms = [STAFF_GROUP_ROOM, ...Array.from(groupRooms.values()), ...directRooms];

    return allRooms.map((room) => {
      const roomMessages = messages.filter((message) => getRoomKeyForMessage(message, user?.id) === room.key);
      const latestMessage = [...roomMessages].sort(
        (first, second) => new Date(second.timestamp) - new Date(first.timestamp)
      )[0];

      return {
        ...room,
        lastMessage: latestMessage?.isDeleted
          ? 'Message unsent'
          : (latestMessage?.text || (latestMessage?.imageUrl ? 'Image attachment' : room.subtitle)),
        timestamp: latestMessage?.timestamp || '',
        count: roomMessages.length,
      };
    }).sort((first, second) => {
      if (first.key === STAFF_GROUP_ROOM.key) return -1;
      if (second.key === STAFF_GROUP_ROOM.key) return 1;
      return new Date(second.timestamp || 0) - new Date(first.timestamp || 0);
    });
  }, [messages, participants, user?.id]);

  const activeRoom = rooms.find((room) => room.key === selectedRoomKey) || rooms[0] || STAFF_GROUP_ROOM;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleRooms = normalizedSearchTerm
    ? rooms.filter((room) => [
      room.name,
      room.subtitle,
      room.lastMessage,
      room.groupKey,
      room.participantId,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearchTerm)))
    : rooms;
  const selectedMessages = messages
    .filter((message) => getRoomKeyForMessage(message, user?.id) === activeRoom.key)
    .sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp));

  const loadMessages = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const [messageList, participantList] = await Promise.all([
        fetchMessages('staff', user?.username),
        fetchMessageParticipants()
      ]);
      setMessages(messageList);
      setParticipants(participantList);
      setError('');
    } catch (loadError) {
      if (!silent) {
        setMessages([]);
        setParticipants([]);
        setError(loadError.message || 'Unable to load staff messages.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    loadMessages();
    const interval = window.setInterval(() => loadMessages({ silent: true }), 5000);
    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedMessages.length, activeRoom.key]);

  useEffect(() => {
    if (!selectedImage) {
      setImagePreview('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(selectedImage);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedImage]);

  const handleSend = async () => {
    if ((!newMessage.trim() && !selectedImage) || !activeRoom) return;

    try {
      setSending(true);
      const sentMessage = await sendMessage({
        roomType: activeRoom.roomType,
        groupKey: activeRoom.groupKey,
        receiverId: activeRoom.participantId,
        ticketId: activeRoom.ticketId,
        text: newMessage,
        image: selectedImage,
      });
      setMessages((previousMessages) => [...previousMessages, sentMessage]);
      setNewMessage('');
      setSelectedImage(null);
      setError('');
      setStatusMessage(`Message sent to ${activeRoom.name}.`);
      window.setTimeout(() => setStatusMessage(''), 2500);
    } catch (sendError) {
      setError(sendError.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const openEditMessage = (message) => {
    setEditingMessage(message);
    setEditText(message.text || '');
  };

  const handleEditMessage = async () => {
    if (!editingMessage || !editText.trim()) return;
    try {
      const updatedMessage = await updateMessage(editingMessage.id, { text: editText });
      setMessages((current) => current.map((message) => (
        message.id === updatedMessage.id ? updatedMessage : message
      )));
      setEditingMessage(null);
      setEditText('');
      setStatusMessage('Message updated.');
      window.setTimeout(() => setStatusMessage(''), 2500);
    } catch (editError) {
      setError(editError.message || 'Unable to edit message.');
    }
  };

  const handleUnsendMessage = async () => {
    if (!confirmUnsendMessage) return;
    try {
      const deletedMessage = await unsendMessage(confirmUnsendMessage.id);
      setMessages((current) => current.map((message) => (
        message.id === deletedMessage.id ? deletedMessage : message
      )));
      setConfirmUnsendMessage(null);
      setStatusMessage('Message unsent.');
      window.setTimeout(() => setStatusMessage(''), 2500);
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to unsend message.');
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">

        {statusMessage && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {statusMessage}
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid h-[calc(100dvh-7.5rem)] min-h-[30rem] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-[calc(100dvh-9rem)] lg:h-[calc(100vh-180px)] lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={`${roomsOpen ? 'flex' : 'hidden'} min-h-0 h-full flex-col bg-white lg:flex lg:border-r lg:border-slate-200`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 lg:hidden">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Messages</p>
                <p className="text-xs text-slate-500">{rooms.length} rooms available</p>
              </div>
              <button
                type="button"
                onClick={() => setRoomsOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Chat
              </button>
            </div>
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <div className="relative">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search"
                  className="h-10 w-full rounded-full border-0 bg-slate-100 px-4 text-sm text-slate-500 outline-none"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <ListSkeleton rows={6} compact />
              ) : visibleRooms.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">
                  {normalizedSearchTerm ? 'No message rooms match your search.' : 'No staff rooms available.'}
                </div>
              ) : (
                visibleRooms.map((room) => (
                  <button
                    key={room.key}
                    type="button"
                    onClick={() => {
                      setSelectedRoomKey(room.key);
                      setRoomsOpen(false);
                    }}
                    className={`w-full rounded-xl px-3 py-3 text-left transition ${activeRoom?.key === room.key ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                  >
                    <div className="flex gap-3">
                      <div className={`grid h-12 w-12 flex-none place-items-center rounded-full text-sm font-bold text-white ${room.roomType === 'group' ? 'bg-slate-900' : 'bg-gradient-to-br from-sky-500 to-blue-700'
                        }`}>
                        {room.roomType === 'group' ? <FiUsers size={19} /> : room.avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-semibold text-slate-950">{room.name}</div>
                          {room.timestamp ? <div className="text-[11px] text-slate-400">{formatTime(room.timestamp)}</div> : null}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{room.subtitle}</div>
                        <div className="mt-1 truncate text-sm text-slate-500">{room.lastMessage}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className={`${roomsOpen ? 'hidden' : 'flex'} min-h-0 h-full flex-col bg-slate-50 lg:flex`}>
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRoomsOpen(true)}
                  className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-700 lg:hidden"
                  aria-label="Open message rooms"
                >
                  <FiArrowLeft size={17} />
                </button>
                <div className={`grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-bold text-white sm:h-11 sm:w-11 ${activeRoom.roomType === 'group' ? 'bg-slate-900' : 'bg-gradient-to-br from-sky-500 to-blue-700'
                  }`}>
                  {activeRoom.roomType === 'group' ? <FiUsers size={19} /> : activeRoom.avatar}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{activeRoom.name}</h3>
                  <p className="truncate text-xs text-slate-500">{activeRoom.subtitle}</p>
                </div>
              </div>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-8 sm:py-5">
              {selectedMessages.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-slate-500">
                  No messages here yet.
                </div>
              ) : (
                selectedMessages.map((message, index) => {
                  const sentByCurrentUser = message.senderId === user?.id;
                  const previousMessage = selectedMessages[index - 1];
                  const sameSender = previousMessage?.senderId === message.senderId;
                  return (
                    <div key={message.id} className={`flex ${sentByCurrentUser ? 'justify-end' : 'justify-start'} ${sameSender ? 'mt-1' : 'mt-4'}`}>
                      <div className={`flex max-w-[88%] items-end gap-2 sm:max-w-lg ${sentByCurrentUser ? 'flex-row-reverse' : ''}`}>
                        {!sentByCurrentUser && !sameSender ? (
                          <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-slate-700 text-xs font-bold text-white">
                            {initials(message.senderName)}
                          </div>
                        ) : (
                          !sentByCurrentUser && <div className="h-8 w-8 flex-none" />
                        )}
                        <div>
                          {!sentByCurrentUser && !sameSender && (
                            <div className="mb-1 ml-1 text-xs font-semibold text-slate-500">{message.senderName}</div>
                          )}
                          <div className={`rounded-[1.35rem] px-3 py-2.5 shadow-sm ${message.isDeleted
                              ? 'border border-slate-200 bg-white text-slate-400'
                              : sentByCurrentUser
                                ? 'rounded-br-md bg-sky-600 text-white'
                                : 'rounded-bl-md bg-white text-slate-950'
                            }`}>
                            {message.isDeleted ? (
                              <p className="text-sm italic leading-6">Message unsent</p>
                            ) : (
                              <>
                                {message.imageUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAttachment({
                                      url: message.imageUrl,
                                      name: message.text || 'Message attachment',
                                    })}
                                    className="block overflow-hidden rounded-2xl text-left"
                                  >
                                    <img
                                      src={message.imageUrl}
                                      alt="Message attachment"
                                      className="max-h-72 w-full max-w-xs object-cover"
                                    />
                                  </button>
                                ) : null}
                                {message.text ? (
                                  <p className={`${message.imageUrl ? 'mt-2' : ''} whitespace-pre-wrap break-words px-1 text-sm leading-6`}>
                                    {message.text}
                                  </p>
                                ) : null}
                              </>
                            )}
                          </div>
                          <div className={`mt-1 flex items-center gap-2 text-[11px] ${sentByCurrentUser ? 'justify-end text-slate-400' : 'ml-1 text-slate-400'}`}>
                            <span>{formatTime(message.timestamp)}</span>
                            {message.editedAt && !message.isDeleted ? <span>Edited</span> : null}
                            {sentByCurrentUser && !message.isDeleted ? (
                              <span className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() => openEditMessage(message)}
                                  className="grid h-6 w-7 place-items-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                                  aria-label="Edit message"
                                >
                                  <FiEdit2 size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmUnsendMessage(message)}
                                  className="grid h-6 w-7 place-items-center border-l border-slate-200 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                                  aria-label="Unsend message"
                                >
                                  <FiTrash2 size={12} />
                                </button>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-5">
              {imagePreview ? (
                <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  <img src={imagePreview} alt="Selected attachment" className="h-14 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{selectedImage?.name}</p>
                    <p className="text-xs text-slate-500">Image ready to send</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-900"
                    aria-label="Remove image"
                  >
                    <FiX size={16} />
                  </button>
                </div>
              ) : null}
              <div className="flex items-end gap-2 rounded-2xl bg-slate-100 p-1.5 sm:rounded-3xl">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setSelectedImage(file);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={sending}
                  className="grid h-10 w-10 flex-none place-items-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                  aria-label="Attach image"
                >
                  <FiImage size={18} />
                </button>
                <textarea
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  rows={1}
                  disabled={sending}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Message ${activeRoom.name}...`}
                  className="min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 disabled:text-slate-400 sm:px-4"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || (!newMessage.trim() && !selectedImage)}
                  className="grid h-10 w-10 flex-none place-items-center rounded-full bg-sky-600 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  aria-label="Send message"
                >
                  <FiSend size={17} />
                </button>
              </div>
            </div>
          </section>
        </div>

        {editingMessage ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">Edit message</h3>
                  <p className="mt-1 text-sm text-slate-500">Update the text you sent.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingMessage(null)}
                  className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Close edit message"
                >
                  <FiX size={17} />
                </button>
              </div>
              <textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                rows={5}
                className="mt-4 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMessage(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditMessage}
                  disabled={!editText.trim()}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {confirmUnsendMessage ? (
          <ConfirmationDialog
            title="Unsend message?"
            message="This removes the message text and attachment from the conversation. A small unsent marker will remain."
            tone="danger"
            icon="warning"
            confirmLabel="Unsend"
            cancelLabel="Cancel"
            onCancel={() => setConfirmUnsendMessage(null)}
            onConfirm={handleUnsendMessage}
          />
        ) : null}

        {previewAttachment ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4">
            <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-slate-900">{previewAttachment.name || 'Message attachment'}</h3>
                  <p className="text-sm text-slate-500">Preview attachment</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={previewAttachment.url}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    <FiDownload size={15} /> Download
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="bg-slate-950 p-4">
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.name || 'Message attachment'}
                  className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

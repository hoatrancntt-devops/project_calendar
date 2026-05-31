import React, { useState } from 'react';
import { X, Calendar, Clock, MapPin, Users, Plus, AlertCircle, RefreshCw } from 'lucide-react';

export default function BookingModal({ date, onClose, onBookEvent, gdEmail }) {
  const formattedDate = date ? new Date(date).toISOString().split('T')[0] : '2026-05-28';

  const [subject, setSubject] = useState('');
  const [eventDate, setEventDate] = useState(formattedDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [eventType, setEventType] = useState('teams');
  const [location, setLocation] = useState('Microsoft Teams / Online Meeting');
  const [body, setBody] = useState('');
  const [attendees, setAttendees] = useState(['nhanvien.chidinh@company.com']);
  const [newAttendeeInput, setNewAttendeeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleAddAttendee = (e) => {
    e.preventDefault();
    const email = newAttendeeInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Email người tham gia không hợp lệ!');
      return;
    }
    if (attendees.includes(email)) { setError('Email này đã được thêm!'); return; }
    setAttendees([...attendees, email]);
    setNewAttendeeInput('');
    setError(null);
  };

  const handleRemoveAttendee = (emailToRemove) =>
    setAttendees(attendees.filter(e => e !== emailToRemove));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim()) { setError('Vui lòng nhập Tiêu đề cuộc họp.'); return; }

    const startStr = `${eventDate}T${startTime}:00`;
    const endStr = `${eventDate}T${endTime}:00`;
    if (new Date(startStr) >= new Date(endStr)) {
      setError('Thời gian kết thúc phải sau thời gian bắt đầu.');
      return;
    }

    setIsSubmitting(true);
    const resolvedLocation = eventType === 'teams' ? 'Microsoft Teams / Online Meeting' : location;

    const payload = {
      subject: subject.trim(),
      start_time: startStr,
      end_time: endStr,
      location: resolvedLocation,
      body: body.trim(),
      attendees: JSON.stringify(
        attendees.map(email => ({ emailAddress: { address: email, name: email.split('@')[0] }, type: 'required' }))
      ),
      organizer: gdEmail
    };

    setTimeout(() => {
      onBookEvent(payload);
      setIsSubmitting(false);
      onClose();
    }, 1200);
  };

  return (
    /* Overlay: slides up from bottom on mobile, centered on desktop */
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Colored header bar */}
        <div className="bg-blue-600 px-5 py-4 flex justify-between items-center text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="opacity-80" />
            <h3 className="font-bold text-base">Đặt Lịch Họp Mới</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-blue-700 rounded-md transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {/* Organizer context */}
          <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
            📅 Đặt lên lịch biểu của: <span className="font-semibold text-blue-600">{gdEmail}</span>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tiêu Đề Cuộc Họp</label>
            <input
              type="text"
              required
              placeholder="Nhập tiêu đề (VD: Họp giao ban đầu tuần)"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          {/* Date + Time row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Calendar size={11} /> Ngày Họp
              </label>
              <input type="date" required className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Clock size={11} /> Bắt Đầu
              </label>
              <input type="time" required className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Clock size={11} /> Kết Thúc
              </label>
              <input type="time" required className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Event type radio */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Hình Thức</label>
            <div className="flex gap-2">
              <label className="flex items-center gap-2 flex-1 p-2.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="radio" name="eventType" value="teams" checked={eventType === 'teams'} onChange={() => { setEventType('teams'); setLocation('Microsoft Teams / Online Meeting'); }} className="text-blue-600" />
                <span className="text-sm text-slate-700">Họp Online (Teams)</span>
              </label>
              <label className="flex items-center gap-2 flex-1 p-2.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="radio" name="eventType" value="offline" checked={eventType === 'offline'} onChange={() => { setEventType('offline'); setLocation(''); }} className="text-blue-600" />
                <span className="text-sm text-slate-700">Offline</span>
              </label>
            </div>
          </div>

          {/* Location — only for offline */}
          {eventType === 'offline' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                <MapPin size={11} /> Địa Điểm
              </label>
              <input
                type="text"
                required
                placeholder="VD: Phòng họp lớn tầng 5"
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
          )}

          {/* Attendees */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Users size={11} /> Người Tham Gia
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Nhập email người cần mời..."
                className="flex-1 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={newAttendeeInput}
                onChange={e => setNewAttendeeInput(e.target.value)}
              />
              <button
                type="button"
                onClick={handleAddAttendee}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus size={14} /> Thêm
              </button>
            </div>

            {attendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {attendees.map(email => (
                  <span key={email} className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-100 text-blue-700 text-xs rounded-full">
                    {email}
                    <button type="button" onClick={() => handleRemoveAttendee(email)} className="hover:text-red-500 transition-colors ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Mô Tả / Nội Dung</label>
            <textarea
              rows={3}
              placeholder="Nhập ghi chú hoặc nội dung chi tiết..."
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* Sync notice */}
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
            <RefreshCw size={13} className="flex-shrink-0 mt-0.5" />
            <p>Event sẽ được <strong>tự động đồng bộ</strong> lên Calendar M365.</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors text-sm"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Clock size={14} className="animate-spin" /> Đang đồng bộ M365...</>
              ) : (
                'Lưu & Đồng bộ M365'
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

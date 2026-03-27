'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Comment } from '@/lib/types';

export interface CommentPanelProps {
  copyBlockId: string;
  currentUserId: string;
}

const POLL_INTERVAL = 5000;

export function CommentPanel({ copyBlockId, currentUserId }: CommentPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?copy_block_id=${copyBlockId}`);
      if (res.ok) {
        const data: Comment[] = await res.json();
        setComments(data);
      }
    } catch {
      // Silently fail on poll
    }
  }, [copyBlockId]);

  // Initial fetch + polling every 5 seconds
  useEffect(() => {
    fetchComments();
    pollRef.current = setInterval(fetchComments, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchComments]);

  const handleAdd = async () => {
    if (!newMessage.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copy_block_id: copyBlockId, message: newMessage.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add comment');
      }
      const comment: Comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setNewMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: string, resolved: boolean) => {
    try {
      const res = await fetch('/api/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved }),
      });
      if (res.ok) {
        const updated: Comment = await res.json();
        setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
      }
    } catch {
      // Silently fail
    }
  };

  const handleEdit = async (id: string) => {
    if (!editMessage.trim()) return;
    try {
      const res = await fetch('/api/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, message: editMessage.trim() }),
      });
      if (res.ok) {
        const updated: Comment = await res.json();
        setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
        setEditingId(null);
        setEditMessage('');
      }
    } catch {
      // Silently fail
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch('/api/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      // Silently fail
    }
  };

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditMessage(comment.message);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
        Comments ({comments.length})
      </div>

      {/* Comment list */}
      <div
        style={{
          maxHeight: 240,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {comments.map((comment) => {
          const isAuthor = comment.authorId === currentUserId;
          const isEditing = editingId === comment.id;

          return (
            <div
              key={comment.id}
              style={{
                padding: 8,
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: comment.resolved ? '#f0fdf4' : '#fff',
                opacity: comment.resolved ? 0.7 : 1,
              }}
            >
              {/* Author + timestamp */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                  {comment.authorName || 'Unknown'}
                </span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>

              {/* Message or edit form */}
              {isEditing ? (
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input
                    type="text"
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEdit(comment.id);
                      if (e.key === 'Escape') { setEditingId(null); setEditMessage(''); }
                    }}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      fontSize: 12,
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                    }}
                    aria-label="Edit comment message"
                  />
                  <button
                    type="button"
                    onClick={() => handleEdit(comment.id)}
                    style={actionBtnStyle}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setEditMessage(''); }}
                    style={actionBtnStyle}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#111827', marginBottom: 4 }}>
                  {comment.message}
                </div>
              )}

              {/* Actions */}
              {!isEditing && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleResolve(comment.id, !comment.resolved)}
                    style={actionBtnStyle}
                    aria-label={comment.resolved ? 'Unresolve comment' : 'Resolve comment'}
                  >
                    {comment.resolved ? 'Unresolve' : 'Resolve'}
                  </button>
                  {isAuthor && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(comment)}
                        style={actionBtnStyle}
                        aria-label="Edit comment"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(comment.id)}
                        style={{ ...actionBtnStyle, color: '#dc2626' }}
                        aria-label="Delete comment"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {comments.length === 0 && (
          <div style={{ fontSize: 12, color: '#9ca3af', padding: 4 }}>No comments yet</div>
        )}
      </div>

      {/* Add comment form */}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Add a comment…"
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 12,
            border: '1px solid #d1d5db',
            borderRadius: 4,
          }}
          aria-label="New comment message"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting || !newMessage.trim()}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            background: submitting ? '#93c5fd' : '#2563eb',
            border: 'none',
            borderRadius: 4,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '…' : 'Send'}
        </button>
      </div>

      {error && (
        <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>
      )}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  color: '#6b7280',
  padding: 0,
  fontWeight: 500,
};

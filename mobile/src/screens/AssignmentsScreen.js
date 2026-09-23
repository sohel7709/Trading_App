/**
 * AssignmentsScreen.js
 * ─────────────────────
 * Lists all assignments for the student's batch.
 * Tapping an assignment opens the detail view to submit.
 *
 * API:
 *   GET  /batches/:batchId/assignments
 *   POST /batches/:batchId/assignments/:id/submit
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, StatusBar, Modal, Pressable,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { BASE_URL } from '../api/client';
import { getAccessToken } from '../services/authService';

// ── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  SUBMITTED: { label: 'Submitted', color: colors.gain,    bg: colors.gainLight, icon: 'checkmark-circle' },
  GRADED:    { label: 'Graded',    color: '#7c3aed',      bg: '#f5f3ff',        icon: 'ribbon' },
  PENDING:   { label: 'Pending',   color: colors.warning, bg: colors.warningLight, icon: 'time' },
  OVERDUE:   { label: 'Overdue',   color: colors.loss,    bg: colors.lossLight, icon: 'alert-circle' },
};

function getDaysLeft(dueDate) {
  return Math.ceil((new Date(dueDate) - Date.now()) / 86400000);
}

function getStatusKey(assignment) {
  if (assignment.mySubmission?.status === 'GRADED') return 'GRADED';
  if (assignment.mySubmission?.status === 'SUBMITTED') return 'SUBMITTED';
  const daysLeft = getDaysLeft(assignment.dueDate);
  if (daysLeft < 0) return 'OVERDUE';
  return 'PENDING';
}

// ── Submit Modal ──────────────────────────────────────────────────────────────
function SubmitModal({ assignment, batchId, onClose, onSubmitted }) {
  const [content, setContent] = useState(assignment?.mySubmission?.content || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return Alert.alert('Please write your submission first');
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${BASE_URL}/batches/${batchId}/assignments/${assignment._id}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).message || 'Submission failed');
      onSubmitted();
      onClose();
    } catch (e) {
      Alert.alert('Submission Failed', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!assignment) return null;
  const daysLeft = getDaysLeft(assignment.dueDate);
  const statusKey = getStatusKey(assignment);
  const statusCfg = STATUS_CONFIG[statusKey];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={modalStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalStyles.kavWrapper}
        pointerEvents="box-none"
      >
        <View style={modalStyles.sheet}>
          {/* Handle */}
          <View style={modalStyles.handle} />

          {/* Header */}
          <View style={modalStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.title}>{assignment.title}</Text>
              <Text style={modalStyles.due}>
                Due: {new Date(assignment.dueDate).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })} {daysLeft > 0 ? `(${daysLeft}d left)` : daysLeft === 0 ? '(Today!)' : '(Overdue)'}
              </Text>
            </View>
            <View style={[modalStyles.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[modalStyles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          </View>

          {/* Scenario / description */}
          {assignment.description ? (
            <View style={modalStyles.descBox}>
              <Text style={modalStyles.descLabel}>SCENARIO</Text>
              <Text style={modalStyles.descText}>{assignment.description}</Text>
            </View>
          ) : null}

          {/* Submission input */}
          <Text style={modalStyles.inputLabel}>YOUR SUBMISSION</Text>
          <TextInput
            style={modalStyles.input}
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={7}
            placeholder="Write your analysis, strategy, or answer here..."
            placeholderTextColor={colors.textMuted}
            textAlignVertical="top"
            editable={statusKey === 'PENDING' || statusKey === 'OVERDUE'}
          />

          {/* Grade (if graded) */}
          {statusKey === 'GRADED' && assignment.mySubmission?.grade !== undefined && (
            <View style={modalStyles.gradeRow}>
              <Text style={modalStyles.gradeLabel}>Score</Text>
              <Text style={modalStyles.gradeValue}>{assignment.mySubmission.grade}/100</Text>
              {assignment.mySubmission.feedback ? (
                <Text style={modalStyles.feedback}>{assignment.mySubmission.feedback}</Text>
              ) : null}
            </View>
          )}

          {/* Submit CTA */}
          {(statusKey === 'PENDING' || statusKey === 'OVERDUE') && (
            <TouchableOpacity
              style={[modalStyles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={modalStyles.submitBtnText}>Submit Assignment</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Assignment Card ───────────────────────────────────────────────────────────
function AssignmentCard({ assignment, onPress }) {
  const statusKey = getStatusKey(assignment);
  const cfg = STATUS_CONFIG[statusKey];
  const daysLeft = getDaysLeft(assignment.dueDate);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left accent */}
      <View style={[styles.accent, { backgroundColor: cfg.color }]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={2}>{assignment.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={12} color={cfg.color} />
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {assignment.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{assignment.description}</Text>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.dueDateRow}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.dueText}>
              {new Date(assignment.dueDate).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short',
              })}
              {daysLeft > 0 ? ` · ${daysLeft}d left` : daysLeft === 0 ? ' · Today' : ' · Overdue'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AssignmentsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const batchId = route?.params?.batchId; // passed from navigation

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const fetchAssignments = useCallback(async () => {
    if (!batchId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const token = await getAccessToken();
      const res = await fetch(`${BASE_URL}/batches/${batchId}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Assignments fetch:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [batchId]);

  useFocusEffect(useCallback(() => { fetchAssignments(); }, [fetchAssignments]));

  const pending = assignments.filter((a) => getStatusKey(a) === 'PENDING' || getStatusKey(a) === 'OVERDUE');
  const done    = assignments.filter((a) => getStatusKey(a) === 'SUBMITTED' || getStatusKey(a) === 'GRADED');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Assignments</Text>
          <Text style={styles.headerSub}>{pending.length} pending · {done.length} done</Text>
        </View>
      </View>

      {/* Stats chips */}
      <View style={styles.statsRow}>
        {[
          { label: 'Total', val: assignments.length, color: colors.primary },
          { label: 'Pending', val: pending.length, color: colors.warning },
          { label: 'Done', val: done.length, color: colors.gain },
        ].map((s) => (
          <View key={s.label} style={styles.statChip}>
            <Text style={[styles.statChipVal, { color: s.color }]}>{s.val}</Text>
            <Text style={styles.statChipLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.listContent,
            assignments.length === 0 && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchAssignments(); }}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <AssignmentCard
              assignment={item}
              onPress={() => setSelectedAssignment(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {batchId ? 'No assignments yet' : 'Batch not found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {batchId
                  ? 'Your instructor hasn\'t published any assignments yet. Check back soon.'
                  : 'Contact your instructor to get enrolled in a batch.'}
              </Text>
            </View>
          }
        />
      )}

      <SubmitModal
        assignment={selectedAssignment}
        batchId={batchId}
        onClose={() => setSelectedAssignment(null)}
        onSubmitted={fetchAssignments}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: { paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  statsRow: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, marginBottom: 16,
  },
  statChip: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.borderLight,
  },
  statChipVal: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statChipLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },

  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight,
  },
  accent: { width: 4 },
  cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dueText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 16 },
  emptySubtitle: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center',
    marginTop: 8, paddingHorizontal: 40, lineHeight: 22,
  },
});

const modalStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  kavWrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1',
    alignSelf: 'center', marginBottom: 20,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  due: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  descBox: { backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 14, marginBottom: 16 },
  descLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.8, marginBottom: 6,
  },
  descText: { fontSize: 13, color: colors.text, lineHeight: 20 },
  inputLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.8, marginBottom: 8,
  },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.text, lineHeight: 22, minHeight: 140,
    marginBottom: 16, backgroundColor: colors.surfaceLight,
  },
  gradeRow: { marginBottom: 16 },
  gradeLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  gradeValue: { fontSize: 28, fontWeight: '800', color: colors.primary },
  feedback: { fontSize: 13, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 18,
  },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

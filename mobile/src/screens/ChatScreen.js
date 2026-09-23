import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState('');
  
  const [messages, setMessages] = useState([
    { id: '1', sender: 'Ms. Rao - Instructor', text: 'Morning everyone. Today we look at what time decay does to an option you hold through lunch.', time: '9:30 am', isSelf: false },
    { id: '2', sender: 'Rahul Menon', text: 'My order got rejected, it said margin.', time: '9:38 am', isSelf: true },
    { id: '3', sender: 'Ms. Rao - Instructor', text: 'You tried 10 lots. Your wallet covers 4. Reduce the quantity and it will go through.', time: '10:01 am', isSelf: false },
    { id: '4', sender: 'Me', text: 'Understood ma\'am. Is the 24850 CE still at the money?', time: '10:22 am', isSelf: true },
  ]);

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Batch 24-A</Text>
          <Text style={styles.headerSubtitle}>Ms. Rao - Instructor</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Batch chat</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.dateDividerWrap}>
          <View style={styles.dateDivider}>
            <Text style={styles.dateDividerText}>Today</Text>
          </View>
        </View>

        {messages.map((m, i) => {
          // If the previous message was from the same sender, hide the name
          const hideName = i > 0 && messages[i - 1].sender === m.sender;
          
          return (
            <View key={m.id} style={[styles.messageRow, m.isSelf ? styles.messageSelf : styles.messageOther]}>
              <View style={[styles.messageBubble, m.isSelf ? styles.bubbleSelf : styles.bubbleOther]}>
                {!hideName && !m.isSelf && (
                  <Text style={styles.senderName}>{m.sender}</Text>
                )}
                {!hideName && m.isSelf && m.sender !== 'Me' && (
                  <Text style={styles.senderNameSelf}>{m.sender}</Text>
                )}
                <Text style={[styles.messageText, m.isSelf ? styles.textSelf : styles.textOther]}>{m.text}</Text>
                <Text style={[styles.messageTime, m.isSelf ? styles.timeSelf : styles.timeOther]}>{m.time}</Text>
              </View>
            </View>
          );
        })}
        
        {/* System Message */}
        <View style={styles.systemMessageWrap}>
          <Text style={styles.systemMessageText}>Ms. Rao paused the market for 2 minutes</Text>
        </View>
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Ask your instructor"
            placeholderTextColor="#94a3b8"
            value={msg}
            onChangeText={setMsg}
          />
          <TouchableOpacity style={styles.sendBtn} disabled={!msg.trim()}>
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  badge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  
  chatScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  
  dateDividerWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  dateDivider: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateDividerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
  
  messageRow: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  messageSelf: {
    justifyContent: 'flex-end',
  },
  messageOther: {
    justifyContent: 'flex-start',
  },
  
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleSelf: {
    backgroundColor: '#f1f5f9',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#eff6ff',
    borderBottomLeftRadius: 4,
  },
  
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A73E8',
    marginBottom: 4,
  },
  senderNameSelf: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  textSelf: {
    color: '#0f172a',
  },
  textOther: {
    color: '#0f172a',
  },
  
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  timeSelf: {
    color: '#94a3b8',
  },
  timeOther: {
    color: '#94a3b8',
  },
  
  systemMessageWrap: {
    alignItems: 'center',
    marginTop: 24,
  },
  systemMessageText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  
  inputRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    paddingVertical: 0,
  },
  sendBtn: {
    backgroundColor: '#1A73E8',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  }
});

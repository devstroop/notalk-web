// Messaging SPA — per-account chat at /accounts/:id/chat.
// Single-account scope injected by the server (window._chatAccount);
// there is no account picker on this surface.
function waApp() {
  return {
    sender: '', senderConnected: false, tab: 'chats', search: '',
    loading: false, listError: '',
    chats: [], contacts: [], groups: [], channels: [],

    activeChat: '', activeChatName: '', activeChatIsGroup: false, activeChatIsChannel: false,
    messages: [], msgsLoading: false, hasOlder: false, oldestTs: '',
    channelMessages: [], channelOldestServerID: 0,
    composeText: '', composeFile: null, sending: false,
    replyTo: null,
    showNewChat: false, newChatPhone: '',
    showBulk: false,
    bulk: { phones: '', text: '', file: null, delay: 3 },
    bulkRunning: false, bulkDone: false, bulkAbort: false,
    bulkSent: 0, bulkTotal: 0, bulkErrors: [],
    _pollTimer: null,

    init() {
      const scoped = window._chatAccount || {}
      if (!scoped.id) return
      this.sender = scoped.id
      this.senderConnected = scoped.connected === true
      this.refreshSenderStatus().then(() => {
        if (this.senderConnected) this.loadTab()
      })
      // Poll sender status every 3s while on this page
      this._statusTimer = setInterval(() => this.refreshSenderStatus(), 3000)
    },

    async refreshSenderStatus() {
      if (!this.sender) {
        this.senderConnected = false
        return
      }
      try {
        const res = await fetch(`/accounts/${this.sender}/session-status`, { credentials: 'same-origin' })
        if (res.status === 403 || res.status === 404) {
          // Account deleted or access revoked mid-chat — back to the list.
          window.location.href = '/accounts'
          return
        }
        const html = await res.text()
        const isConnected = html.includes('Connected') && !html.includes('Disconnected')
        this.senderConnected = isConnected
      } catch {
        // keep last known state on transient network errors
      }
    },

    async loadTab() {
      if (!this.sender) return
      this.loading = true; this.listError = ''
      try {
        if (this.tab === 'chats') {
          const r = await this.api('GET', `/whatsapp/${this.sender}/chats`)
          this.chats = r.chats || r || []
        } else if (this.tab === 'contacts') {
          const r = await this.api('GET', `/whatsapp/${this.sender}/contacts`)
          this.contacts = r.contacts || r || []
          if (!Array.isArray(this.contacts)) this.contacts = []
        } else if (this.tab === 'groups') {
          const r = await this.api('GET', `/whatsapp/${this.sender}/groups`)
          this.groups = r.groups || r || []
          if (!Array.isArray(this.groups)) this.groups = []
        } else if (this.tab === 'channels') {
          const r = await this.api('GET', `/whatsapp/${this.sender}/newsletters`)
          this.channels = r.newsletters || r.channels || r || []
          if (!Array.isArray(this.channels)) this.channels = []
        }
      } catch (e) { this.listError = e.message }
      this.loading = false
    },

    async openChat(jid, name, isGroup) {
      this.activeChat = jid
      let displayName = name
      if (!displayName || displayName === jid || displayName === jid.split('@')[0]) {
        displayName = isGroup ? 'Group' : this.formatJID(jid)
      }
      this.activeChatName = displayName
      this.activeChatIsGroup = isGroup
      this.activeChatIsChannel = false
      this.replyTo = null
      this.composeText = ''
      this.composeFile = null
      await this.loadMessages()
      this.markAsRead()
      this.startPolling()
    },

    async openChannel(ch) {
      this.activeChat = ch.id
      this.activeChatName = ch.name || ch.id.split('@')[0]
      this.activeChatIsGroup = false
      this.activeChatIsChannel = true
      this.replyTo = null
      this.composeText = ''
      this.composeFile = null
      this.stopPolling()
      await this.loadChannelMessages()
    },

    async loadChannelMessages() {
      this.msgsLoading = true
      try {
        const r = await this.api('GET', `/whatsapp/${this.sender}/newsletter-messages?jid=${encodeURIComponent(this.activeChat)}`)
        const raw = r.messages || []
        this.messages = raw.slice().reverse()
        this.hasOlder = raw.length >= 50
        this.channelOldestServerID = raw.length ? raw[0].server_id : 0
        this.oldestTs = ''
        this.$nextTick(() => this.scrollToBottom())
      } catch (e) { console.error('loadChannelMessages:', e) }
      this.msgsLoading = false
    },

    async loadOlderChannelMessages() {
      if (!this.channelOldestServerID) return
      this.msgsLoading = true
      try {
        const r = await this.api('GET', `/whatsapp/${this.sender}/newsletter-messages?jid=${encodeURIComponent(this.activeChat)}&before=${this.channelOldestServerID}`)
        const raw = r.messages || []
        const older = raw.slice().reverse()
        this.messages = [...older, ...this.messages]
        this.hasOlder = raw.length >= 50
        this.channelOldestServerID = raw.length ? raw[0].server_id : this.channelOldestServerID
      } catch (e) { console.error('loadOlderChannel:', e) }
      this.msgsLoading = false
    },

    async unfollowChannel() {
      if (!confirm('Unfollow this channel?')) return
      const channelId = this.activeChat
      const channelIdx = this.channels.findIndex(c => c.id === channelId)
      const channelBackup = channelIdx >= 0 ? this.channels[channelIdx] : null
      if (channelIdx >= 0) this.channels.splice(channelIdx, 1)
      this.activeChat = ''
      this.messages = []
      try {
        await this.api('POST', `/whatsapp/${this.sender}/newsletter-unfollow`, { jid: channelId })
      } catch (e) {
        if (channelBackup) this.channels.splice(channelIdx, 0, channelBackup)
        alert('Unfollow failed: ' + e.message)
      }
    },

    async loadMessages() {
      this.msgsLoading = true
      try {
        const r = await this.api('GET', `/whatsapp/${this.sender}/messages?chat=${encodeURIComponent(this.activeChat)}`)
        const raw = r.messages || []
        this.messages = raw.slice().reverse()
        this.hasOlder = raw.length >= 50
        this.oldestTs = this.messages.length ? this.messages[0].timestamp : ''
        this.$nextTick(() => this.scrollToBottom())
      } catch (e) { console.error('loadMessages:', e) }
      this.msgsLoading = false
    },

    async pollMessages() {
      if (!this.activeChat || !this.sender) return
      try {
        const r = await this.api('GET', `/whatsapp/${this.sender}/messages?chat=${encodeURIComponent(this.activeChat)}`)
        const raw = r.messages || []
        const fresh = raw.slice().reverse()
        if (fresh.length === 0) return
        const serverById = new Map(fresh.map(m => [m.id || m.message_id, m]))
        for (let i = this.messages.length - 1; i >= 0; i--) {
          const m = this.messages[i]
          if (m._localId && m._status === 'sent' && m.id && serverById.has(m.id)) {
            this.messages.splice(i, 1, serverById.get(m.id))
            serverById.delete(m.id)
          }
        }
        const existingIds = new Set(this.messages.filter(m => !m._localId).map(m => m.id || m.message_id))
        const newMsgs = fresh.filter(m => !existingIds.has(m.id || m.message_id))
        if (newMsgs.length > 0) {
          const el = this.$refs.msgScroll
          const wasAtBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight < 80) : true
          const firstLocalIdx = this.messages.findIndex(m => m._localId && m._status !== 'sent')
          if (firstLocalIdx >= 0) {
            this.messages.splice(firstLocalIdx, 0, ...newMsgs)
          } else {
            this.messages.push(...newMsgs)
          }
          if (wasAtBottom) this.$nextTick(() => this.scrollToBottom())
          this.markAsRead()
        }
        this.hasOlder = raw.length >= 50
      } catch (e) { /* silent */ }
    },

    async loadOlderMessages() {
      if (!this.oldestTs) return
      this.msgsLoading = true
      try {
        const r = await this.api('GET', `/whatsapp/${this.sender}/messages?chat=${encodeURIComponent(this.activeChat)}&before=${encodeURIComponent(this.oldestTs)}`)
        const raw = r.messages || []
        const older = raw.slice().reverse()
        this.messages = [...older, ...this.messages]
        this.hasOlder = raw.length >= 50
        this.oldestTs = older.length ? older[0].timestamp : this.oldestTs
      } catch (e) { console.error('loadOlder:', e) }
      this.msgsLoading = false
    },

    startPolling() {
      this.stopPolling()
      this._pollTimer = setInterval(() => {
        if (this.activeChat && this.sender && !this.msgsLoading) this.pollMessages()
      }, 5000)
    },
    stopPolling() {
      if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null }
    },

    async sendMessage() {
      if (!this.sender || !this.activeChat) return
      if (!this.composeText.trim() && !this.composeFile) return
      this.sending = true
      const localId = '_local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      const optimistic = {
        _localId: localId,
        _status: 'sending',
        id: localId,
        from_me: true,
        body: this.composeText.trim() || '',
        media_type: this.composeFile ? this.composeFile.name.split('.').pop() : '',
        timestamp: new Date().toISOString(),
        reactions: {},
      }
      this.messages.push(optimistic)
      this.$nextTick(() => this.scrollToBottom())
      const text = this.composeText
      const file = this.composeFile
      const reply = this.replyTo
      this.composeText = ''
      this.composeFile = null
      this.replyTo = null
      const ta = this.$el.querySelector('textarea[x-model="composeText"]')
      if (ta) ta.style.height = 'auto'
      try {
        const fd = new FormData()
        fd.append('chat', this.activeChat)
        if (text.trim()) fd.append('text', text)
        if (file) fd.append('file', file)
        const res = await fetch(`/whatsapp/${this.sender}/send`, { method: 'POST', body: fd, credentials: 'same-origin' })
        if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || res.statusText) }
        const data = await res.json()
        const msg = this.messages.find(m => m._localId === localId)
        if (msg) {
          msg._status = 'sent'
          if (data.message_id) msg.id = data.message_id
        }
        const chat = this.chats.find(c => c.id === this.activeChat)
        if (chat) {
          chat.last_message = text.trim() || (file ? '[media]' : '')
          chat.timestamp = new Date().toISOString()
        }
      } catch (e) {
        const msg = this.messages.find(m => m._localId === localId)
        if (msg) msg._status = 'failed'
        console.error('Send failed:', e.message)
      }
      this.sending = false
    },

    retryMessage(msg) {
      const idx = this.messages.indexOf(msg)
      if (idx >= 0) this.messages.splice(idx, 1)
      this.composeText = msg.body || ''
      this.$nextTick(() => this.sendMessage())
    },

    async reactToMessage(msg, emoji) {
      if (!msg.reactions) msg.reactions = {}
      const prev = msg.reactions[emoji] || 0
      msg.reactions = { ...msg.reactions, [emoji]: prev + 1 }
      try {
        await this.api('POST', `/whatsapp/${this.sender}/react`, { chat: this.activeChat, message_id: msg.id, emoji })
      } catch (e) {
        const cur = msg.reactions[emoji] || 1
        if (cur <= 1) { const copy = { ...msg.reactions }; delete copy[emoji]; msg.reactions = copy }
        else { msg.reactions = { ...msg.reactions, [emoji]: cur - 1 } }
        console.error('react:', e)
      }
    },

    startNewChat() {
      if (!this.newChatPhone.trim()) return
      const phone = this.newChatPhone.trim().replace(/[^0-9]/g, '')
      const jid = phone + '@s.whatsapp.net'
      this.showNewChat = false
      this.newChatPhone = ''
      this.openChat(jid, phone, false)
    },

    async sendBulk() {
      if (!this.sender) return
      const phones = this.bulk.phones.split('\n').map(l => l.trim()).filter(Boolean)
      if (!phones.length) return
      this.bulkRunning = true; this.bulkDone = false; this.bulkAbort = false
      this.bulkSent = 0; this.bulkTotal = phones.length; this.bulkErrors = []
      for (const phone of phones) {
        if (this.bulkAbort) break
        try {
          const fd = new FormData()
          fd.append('phone', phone)
          fd.append('text', this.bulk.text)
          if (this.bulk.file) fd.append('file', this.bulk.file)
          const res = await fetch(`/whatsapp/${this.sender}/send`, { method: 'POST', body: fd, credentials: 'same-origin' })
          if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || res.statusText) }
          this.bulkSent++
        } catch (e) {
          this.bulkErrors.push({ phone, error: e.message })
          this.bulkSent++
        }
        if (!this.bulkAbort && phone !== phones[phones.length - 1]) {
          await new Promise(r => setTimeout(r, this.bulk.delay * 1000))
        }
      }
      this.bulkRunning = false; this.bulkDone = true
    },

    formatJID(jid) {
      if (!jid) return ''
      const user = jid.split('@')[0]
      if (/^\d+$/.test(user)) return '+' + user
      return user
    },
    contactName(c) { return c.full_name || c.business_name || c.push_name || this.formatJID(c.id) || '' },

    get filteredChats() {
      const q = this.search.toLowerCase()
      if (!q) return this.chats
      return this.chats.filter(c => (c.name || c.id || '').toLowerCase().includes(q))
    },
    get filteredContacts() {
      const q = this.search.toLowerCase()
      if (!q) return this.contacts
      return this.contacts.filter(c => (this.contactName(c) + ' ' + (c.phone || '')).toLowerCase().includes(q))
    },
    get filteredGroups() {
      const q = this.search.toLowerCase()
      if (!q) return this.groups
      return this.groups.filter(g => (g.name || '').toLowerCase().includes(q))
    },
    get filteredChannels() {
      const q = this.search.toLowerCase()
      if (!q) return this.channels
      return this.channels.filter(ch => (ch.name || '').toLowerCase().includes(q))
    },

    formatTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const now = new Date()
      if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    },
    formatMsgTime(ts) {
      if (!ts) return ''
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    },
    scrollToBottom() {
      const el = this.$refs.msgScroll
      if (el) el.scrollTop = el.scrollHeight
    },

    markAsRead() {
      if (!this.sender || !this.activeChat || this.activeChatIsChannel) return
      const unread = this.messages.filter(m => !m.from_me).map(m => m.id || m.message_id).filter(Boolean)
      if (!unread.length) return
      this.api('POST', `/whatsapp/${this.sender}/mark-read`, { chat: this.activeChat, message_ids: unread }).catch(() => {})
      const chat = this.chats.find(c => c.id === this.activeChat)
      if (chat) chat.unread_count = 0
    },

    async api(method, path, body) {
      const opts = { method, credentials: 'same-origin', headers: {} }
      if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
      const res = await fetch(path, opts)
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || res.statusText) }
      return await res.json()
    }
  }
}

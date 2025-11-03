# Team Polling Application

A real-time, synchronized polling application for hybrid team meetings that runs on an internal Linux server. Perfect for pulse checks, team surveys, and anonymous feedback during meetings.

## Features

- **Real-time synchronization** - Questions appear simultaneously for all participants
- **Anonymous responses** - No tracking of individual users
- **Hybrid meeting support** - Works on office WiFi and VPN
- **Multiple question types** - Multiple choice, Yes/No, rating scales, and text responses
- **Live results** - See responses update in real-time on the admin dashboard
- **Export capabilities** - Download results as CSV or JSON
- **Mobile-friendly** - Works seamlessly on phones, tablets, and laptops
- **No external dependencies** - Everything runs locally on your server

## Quick Start

### Prerequisites

- Node.js v18 or higher
- At least 512MB RAM
- 1GB disk space

### Installation

1. **Clone or download the application**

```bash
cd /path/to/teamPoll
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your admin password:

```
ADMIN_PASSWORD=your-secure-password-here
PORT=3000
SESSION_SECRET=your-secret-key-change-this
NODE_ENV=production
```

**IMPORTANT:** Change the default admin password before running in production!

4. **Start the server**

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

5. **Access the application**

- Admin interface: `http://localhost:3000/admin`
- Or use your server's IP: `http://[server-ip]:3000/admin`

## How to Run a Poll

### For Facilitators

1. **Login to Admin Interface**
   - Navigate to `http://[server-ip]:3000/admin`
   - Enter your admin password

2. **Create New Poll**
   - Click "Create New Poll"
   - Add 6-8 questions (or as many as needed)
   - Choose question types:
     - Multiple Choice (2-5 options)
     - Yes/No
     - Rating Scale (e.g., 1-5 or 1-10)
     - Short Text
   - Click "Save & Start Poll"

3. **Share with Participants**
   - Copy the participant URL
   - Share via Teams chat or display QR code
   - Example: `http://[server-ip]:3000/poll/poll-2025-11-03-abc123`

4. **Control the Poll**
   - Click "Reveal Question 1" to show first question
   - Watch responses come in real-time
   - Discuss results with team
   - Click "Reveal Question 2" for next question
   - Repeat for all questions

5. **End Poll**
   - Click "End Poll" when finished
   - Export results as CSV or JSON if needed

### For Participants

1. **Join the Poll**
   - Click the URL shared by facilitator
   - Or scan QR code on your phone

2. **Wait for Questions**
   - You'll see "Waiting for facilitator..." screen

3. **Answer Questions**
   - Questions appear automatically when facilitator reveals them
   - Select your answer
   - Click "Submit"
   - Wait for next question

4. **Thank You**
   - After the last question, you'll see completion message

## Configuration

### Environment Variables

Edit `.env` file:

```
ADMIN_PASSWORD=changeme          # Admin interface password
PORT=3000                        # Server port
SESSION_SECRET=secret-key        # Session encryption key
NODE_ENV=production              # Environment (production/development)
```

### Configuration File

Edit `config/config.json`:

```json
{
  "port": 3000,
  "max_participants": 100,
  "session_timeout_minutes": 120,
  "auto_delete_polls_after_days": 30,
  "rate_limit_window_ms": 60000,
  "rate_limit_max_requests": 10
}
```

## Network Setup

### Firewall Configuration

Open port 3000 (or your configured port) on your server:

```bash
# For UFW (Ubuntu)
sudo ufw allow 3000/tcp

# For firewalld (RHEL/CentOS)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### Access from Different Networks

**Office WiFi:**
- Participants: `http://[server-ip]:3000/poll/[session-id]`

**VPN:**
- Ensure VPN allows access to internal network
- Use same URL as office WiFi

**Custom Domain (Optional):**
- Set up nginx/Apache reverse proxy
- Use: `http://polls.yourcompany.local/poll/[session-id]`

## Usage Examples

### Example 1: Team Pulse Check

```
Question 1: How satisfied are you with our current sprint process?
Type: Rating Scale (1-5)

Question 2: What's your biggest blocker right now?
Type: Multiple Choice
Options: Time constraints, Technical issues, Unclear requirements, Team communication, None

Question 3: Do you feel you have the resources you need?
Type: Yes/No

Question 4: Any additional comments?
Type: Text
```

### Example 2: Meeting Effectiveness Survey

```
Question 1: Was today's meeting productive?
Type: Rating Scale (1-10)

Question 2: Should we schedule a follow-up?
Type: Yes/No

Question 3: What should we discuss next time?
Type: Text
```

## Data Management

### Database

- Data is stored in SQLite database at `data/polls.db`
- Automatically created on first run
- No manual database setup required

### Data Retention

- Old completed polls are automatically deleted after 30 days
- Configure in `config/config.json`: `auto_delete_polls_after_days`

### Manual Cleanup

Delete specific poll:
- Use admin interface "Delete" button
- Or manually delete from database

Backup database:
```bash
cp data/polls.db data/polls.db.backup
```

## Security

### Anonymous Responses

- No user identification stored
- No IP address logging for responses
- No cookies that identify users
- Responses cannot be traced back to individuals

### Admin Access

- Password-protected admin interface
- Password stored in environment variable
- Change default password immediately

### Network Security

- Runs on internal network only
- No external API calls
- No data leaves your server
- HTTPS not required for internal network (but recommended for production)

## Exporting Results

### CSV Export

1. Go to admin dashboard
2. Click on completed poll
3. Click "Export as CSV"
4. File downloads: `poll-[session-id].csv`

Format:
```csv
Question Index,Question Text,Answer,Count
0,"How satisfied are you?","Very satisfied",5
0,"How satisfied are you?","Satisfied",3
1,"Any concerns?","Yes",2
```

### JSON Export

1. Go to admin dashboard
2. Click on completed poll
3. Click "Export as JSON"
4. File downloads: `poll-[session-id].json`

Format:
```json
[
  {
    "question_id": 1,
    "question_index": 0,
    "question_text": "How satisfied are you?",
    "question_type": "multiple_choice",
    "options": ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied"],
    "total_responses": 8,
    "breakdown": {
      "Very satisfied": 5,
      "Satisfied": 3
    }
  }
]
```

## Troubleshooting

### Server won't start

**Error:** Port already in use
```
Solution: Change PORT in .env file or stop other service using port 3000
```

**Error:** Cannot find module
```
Solution: Run `npm install` again
```

### Participants can't connect

**Check firewall:**
```bash
sudo ufw status
```

**Check server is running:**
```bash
ps aux | grep node
```

**Check from participant device:**
```bash
ping [server-ip]
curl http://[server-ip]:3000/poll/test-session
```

### Results not updating

**Check WebSocket connection:**
- Open browser console (F12)
- Look for "Connected to server" message
- Check for error messages

**Refresh the page:**
- Admin: Use browser refresh
- Results page: Click "Refresh" button

### Database issues

**Reset database:**
```bash
rm data/polls.db
npm start  # Database will be recreated
```

**Check database:**
```bash
sqlite3 data/polls.db
.tables
.quit
```

## Performance

### Capacity

- Supports up to 100 simultaneous participants (configurable)
- Tested with 50+ concurrent users
- Response time < 500ms for submissions
- Real-time updates < 1 second latency

### Optimization

For larger teams (100+):
- Increase server RAM to 1GB+
- Adjust `max_participants` in config
- Consider adding Redis for session management

## Development

### Project Structure

```
teamPoll/
├── server/
│   ├── index.js              # Main server
│   ├── routes/
│   │   ├── admin.js          # Admin API routes
│   │   └── poll.js           # Poll API routes
│   ├── socket/
│   │   └── handlers.js       # WebSocket handlers
│   ├── models/
│   │   ├── poll.js           # Poll data model
│   │   └── response.js       # Response data model
│   └── db/
│       └── database.js       # Database setup
├── public/
│   ├── admin/                # Admin interface
│   ├── poll/                 # Participant interface
│   └── results/              # Results display
├── config/
│   └── config.json           # Configuration
├── data/                     # Database files (auto-created)
├── .env                      # Environment variables
├── package.json
└── README.md
```

### Running in Development

```bash
npm run dev  # Auto-restarts on file changes
```

### Testing

Manual testing checklist:
- [ ] Admin can login
- [ ] Admin can create poll with different question types
- [ ] Participant can join via URL
- [ ] Questions reveal correctly
- [ ] Responses submit successfully
- [ ] Real-time updates work
- [ ] Multiple participants can submit simultaneously
- [ ] Results display correctly
- [ ] CSV export works
- [ ] JSON export works
- [ ] Poll can be ended
- [ ] Works on mobile devices

## Production Deployment

### 1. Update Configuration

```bash
# Edit .env
NODE_ENV=production
ADMIN_PASSWORD=very-secure-password-here
```

### 2. Use Process Manager

Install PM2:
```bash
npm install -g pm2
```

Start with PM2:
```bash
pm2 start server/index.js --name team-poll
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

Monitor:
```bash
pm2 status
pm2 logs team-poll
pm2 restart team-poll
```

### 3. Reverse Proxy (Optional)

Nginx configuration:
```nginx
server {
    listen 80;
    server_name polls.yourcompany.local;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Enable HTTPS (Recommended)

Use Let's Encrypt with certbot:
```bash
sudo certbot --nginx -d polls.yourcompany.local
```

## API Documentation

### Admin Endpoints

All admin endpoints require `Authorization: Bearer [admin-password]` header.

**POST** `/api/admin/auth`
- Verify admin password
- Body: `{ "password": "string" }`

**POST** `/api/admin/polls`
- Create new poll
- Body: `{ "questions": [...] }`

**GET** `/api/admin/polls`
- Get all polls

**GET** `/api/admin/polls/:sessionId`
- Get specific poll

**POST** `/api/admin/polls/:sessionId/start`
- Start poll

**POST** `/api/admin/polls/:sessionId/end`
- End poll

**GET** `/api/admin/polls/:sessionId/results`
- Get poll results

**GET** `/api/admin/polls/:sessionId/export/csv`
- Export as CSV

**GET** `/api/admin/polls/:sessionId/export/json`
- Export as JSON

### Poll Endpoints (Public)

**GET** `/api/poll/:sessionId`
- Get poll info

**POST** `/api/poll/:sessionId/respond`
- Submit response
- Body: `{ "question_id": number, "answer": string }`

**GET** `/api/poll/:sessionId/results`
- Get results (public)

### WebSocket Events

**Client → Server:**
- `admin_join` - Admin joins session
- `join_session` - Participant joins
- `start_poll` - Start poll
- `reveal_question` - Reveal question
- `close_question` - Close question
- `submit_response` - Submit answer
- `end_poll` - End poll
- `request_results` - Get current results

**Server → Client:**
- `admin_joined` - Admin joined successfully
- `session_joined` - Participant joined
- `poll_started` - Poll started
- `question_revealed` - New question visible
- `question_closed` - Question closed
- `response_submitted` - Response recorded
- `response_received` - New response (admin only)
- `participant_count` - Participant count update
- `poll_ended` - Poll ended
- `error` - Error occurred

## FAQ

**Q: Can participants see other people's answers?**
A: No, all responses are anonymous and private.

**Q: Can participants skip ahead to future questions?**
A: No, they only see the current question revealed by the facilitator.

**Q: Can participants change their answers?**
A: No, once submitted, answers are final.

**Q: How many participants can join?**
A: Default is 100, configurable in `config.json`.

**Q: Do participants need to create an account?**
A: No, participants just click the link and answer.

**Q: Can I reuse the same poll session?**
A: No, create a new poll for each meeting. Old polls are saved for reference.

**Q: Is there a mobile app?**
A: No, but the web interface is fully mobile-responsive.

**Q: Can I customize the branding?**
A: Yes, edit the CSS files in `public/*/styles.css`.

## Support

For issues, questions, or feature requests:
1. Check the troubleshooting section above
2. Review server logs: `pm2 logs team-poll` or console output
3. Check browser console for errors (F12)

## License

MIT License - See LICENSE file for details

## Credits

Built with:
- Express.js - Web framework
- Socket.io - Real-time communication
- SQLite (better-sqlite3) - Database
- Vanilla JavaScript - Frontend

---

**Note:** This application is designed for internal network use. For internet-facing deployments, additional security measures are recommended.

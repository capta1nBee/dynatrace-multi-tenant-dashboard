# Installation Guide - Dynatrace Multi-Tenant Monitoring Application

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Dynatrace Token Setup](#dynatrace-token-setup)
3. [Local Installation (npm)](#local-installation-npm)
4. [Docker Installation](#docker-installation)

---

## Prerequisites

- **Node.js** 16+ and npm 8+
- **Dynatrace Account** with API access
- **Docker** (for Docker/Kubernetes deployment)

---

## Dynatrace Token Setup

### Step 1: Access Dynatrace API Tokens

1. Log in to your Dynatrace environment
2. Navigate to **Settings** → **Integration** → **Dynatrace API**
3. Click on **Generate token**

### Step 2: Create API Token

1. **Token Name**: Enter a descriptive name (e.g., "Multi-Tenant Monitoring App")
2. **Select Scopes**: Enable the following scopes:
   - `problems.read` - Read problems/alarms
   - `problems.write` - Write comments on problems
   - `entities.read` - Read entities/assets
   - `entityTypes.read` - Read entity types
   - `settings.read` - Read settings

3. Click **Generate token**
4. **Copy the token** - You'll need this for configuration

### Step 3: Get Your Environment ID

1. Your Dynatrace URL format: `https://{environment-id}.live.dynatrace.com`
2. Extract the `{environment-id}` part

---

## Local Installation (npm)

### Step 1: Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd dynatrace-multi-tenant-app

# Install dependencies
npm install
```

### Step 2: Run the Application

**Option A: Development Mode (Frontend + Backend)**
```bash
npm run dev:all
```

**Option B: Frontend Only**
```bash
npm run dev
# Frontend runs on http://localhost:5173
```

**Option C: Backend Only**
```bash
npm run dev:server
# Backend runs on http://localhost:5000
```

### Step 4: Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000/api

### Step 5: Admin User Automatically Created

Follow the prompts to create your first admin user.

### Step 6: Configure Dynatrace Tenants

1. Log in with your admin credentials
2. Go to **Tenant Management**
3. Click **Create Tenant**
4. Fill in the form:
   - **Tenant Name**: Your tenant name
   - **Dynatrace Environment ID**: Your environment ID (from Dynatrace URL)
   - **Dynatrace API URL**: `https://{environment-id}.live.dynatrace.com/api/v2`
   - **Dynatrace API Token**: Your API token (created in [Dynatrace Token Setup](#dynatrace-token-setup))
5. Click **Create** - The application will test the connection and auto-sync assets

### Step 7: Configure Authentication (Optional)

To enable LDAP or OIDC authentication:

1. Go to **Settings** → **Authentication**
2. Select authentication type (LOCAL, LDAP, or OIDC)
3. Fill in the configuration details
4. Click **Save**

**LDAP Configuration:**
- LDAP Server: Your LDAP server address
- LDAP Port: Usually 389 (or 636 for TLS)
- Base DN: Your LDAP base DN (e.g., `dc=example,dc=com`)
- Bind DN: Service account DN (optional)
- Bind Password: Service account password (optional)
- User Search Filter: LDAP filter (default: `(uid={0})`)
- Login Attribute: LDAP attribute for login (default: `uid`)
- Use TLS: Enable TLS encryption

---

## Docker Installation

### Step 1: Create Dockerfile

A `Dockerfile` is included in the project. Build the image:

```bash
docker build -t dynatrace-multi-tenant-app:latest .
```

### Step 2: Run with Docker Compose

A `docker-compose.yml` file is included in the project. Run it:

```bash
docker-compose up -d
```

### Step 3: Admin User Create automatic

### Step 4: Configure Dynatrace Tenants

1. Access the application at `http://localhost:5000`
2. Log in with your admin credentials
3. Go to **Tenant Management**
4. Click **Create Tenant** and fill in:
   - **Tenant Name**: Your tenant name
   - **Dynatrace API URL**: `https://{environment-id}.live.dynatrace.com/api/v2`
   - **Dynatrace API Token**: Your API token
5. Click **Create**

**Note:** Dynatrace credentials are stored per tenant in the database, not in environment variables.

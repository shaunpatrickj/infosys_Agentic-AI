# 🚀 How to Start the FacilityOps AI Platform

Follow these simple instructions to launch the platform anytime with a single copy-paste command.

---

## ⚡ Method 1: The Quickest One-Line Command (Recommended)

Open your terminal and paste this single command:

```bash
cd "/Users/shaunpatrick/Downloads/internship ai agent" && ./start.sh
```

### What This Command Does Automatically:
1. Checks and uses Python 3.
2. Activates the virtual environment and checks required packages.
3. Seeds the SQLite database (`facilityops.db`) with 2,976 records.
4. Trains the AI models (**Isolation Forest** & **Gradient Boosting**).
5. Clears any stuck process on port `8000`.
6. Launches the FastAPI backend server.
7. **Automatically opens your web browser to `http://localhost:8000`**.

---

## 🛠️ Method 2: Step-by-Step Manual Start

If you ever want to run each step individually:

### Step 1: Open the Project Folder
```bash
cd "/Users/shaunpatrick/Downloads/internship ai agent"
```

### Step 2: Clear Port 8000 (If Already in Use)
```bash
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
```

### Step 3: Run the Startup Script
```bash
chmod +x start.sh
./start.sh
```

---

## 🛑 How to Stop the Server

When you want to stop the application:
* In your terminal window where the server is running, press **`Ctrl + C`**.

---

## 🌐 URLs & Access Points

Once started, the following links are active:

| Service | URL | Description |
| :--- | :--- | :--- |
| **FacilityOps Dashboard** | **[http://localhost:8000](http://localhost:8000)** | Full interactive AI monitoring dashboard |
| **API Documentation** | **[http://localhost:8000/docs](http://localhost:8000/docs)** | Interactive Swagger UI testing all endpoints |
| **API Health Check** | **[http://localhost:8000/api/health](http://localhost:8000/api/health)** | Server & ML model status JSON |

---

## ❓ Troubleshooting

### 1. Browser shows "Connection Refused"
Run:
```bash
cd "/Users/shaunpatrick/Downloads/internship ai agent" && ./start.sh
```

### 2. "Port 8000 address already in use"
Run:
```bash
lsof -ti :8000 | xargs kill -9
```
Then run `./start.sh` again.

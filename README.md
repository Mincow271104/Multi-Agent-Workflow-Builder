<div align="center">
  <h1>🤖 Multi-Agent Workflow Builder</h1>
  <p><i>A Scalable Platform for Visual AI Agent Orchestration & Execution</i></p>
</div>

## 📖 Project Overview

**Multi-Agent Workflow Builder** is a powerful web application platform that allows users to design, customize, and orchestrate complex Artificial Intelligence pipelines. The system breaks down macro-objectives into specific micro-tasks, autonomously delegating them to a network of specialized AI Agents (e.g., Researcher, Writer, Translator, Critic) for sequential or parallel execution.

Built upon a node-based GUI data-flow architecture and real-time Socket.io streaming, the platform provides users with unparalleled transparency and control over the "thought processes" and reasoning loops of Large Language Models (LLMs).

---

## 🚀 3 Core Execution Architectures

The system features 3 distinct Pipeline modes, catering to everything from strict manual control to full AI autonomy:

### 1. Waterfall Mode (Topological Pipeline)
The traditional execution mode. Users manually draw mind maps, directly wiring Agent A to Agent B. The system strictly adheres to the Topological Sort structure, passing the output data of the previous generation as the input to the next.  
🔹 *Characteristics:* 100% data flow control, ideal for standardized, fixed business processes.

![Waterfall Mode](WATER%20FALL%20MODE.png)

### 2. Dynamic Hybrid Mode (Fully Autonomous Orchestration)
Maximum autonomy. The system appoints an AI to act as the **Chief Orchestrator**. The Orchestrator analyzes the user's "Original Directive", scans the available AI Agents on the canvas, and autonomously reasons out an execution loop to generate a JSON Execution Plan.  
🔹 *Characteristics:* Collaborative teamwork without any manual wiring. The user only needs to provide the final command.

![Dynamic Hybrid Mode](DYNAMIC%20HYBRID%20MODE.png)

### 3. Hybrid Supervisor Mode (Dynamic Chained Routing)
The perfect fusion of an **AI Dynamic Planner** and **Human Force Constraints**.
- The Orchestrator retains the freedom to plan the overall execution freely.
- However, when the execution hits an Agent that the user has intentionally *hard-wired* (e.g., `Writer` is strictly wired to `Critic`), the system activates the **Force-Pull Chain Law**. It immediately pulls all adjacent Agents to run as a cluster (ping-pong feedback loops) before returning to the free assignment flow.
🔹 *Characteristics:* A flawless balance between AI's creative freedom and strict human supervisory loops.

![Hybrid Supervisor Mode](HYBRID%20SUPERVISOR%20MODE%20%28DYNAMIC%20CHAINED%20ROUTING%29.png)

---

## 🛠️ Advanced Features & Experience

### 🎨 Custom Agent Builder
Users have the freedom to expand the system's limits by creating new AI Agents as custom Nodes. The platform provides an in-depth configuration suite including: Agent Name, Role Positioning, Foundation Model selection (e.g., Llama 3, Qwen, Mistral), and creative Temperature metrics. Every workflow now operates like a virtual enterprise with infinite specialized personnel.

### 🪄 AI System Prompt Generator
To resolve the difficulty of writing psychological constraints and persona System Prompts for new Agents, the platform integrates a "Prompt Engineering Assistant". You simply type a brief job title (e.g., *Practical SEO Expert*), and the system automatically synthesizes a professional, structurally standardized System Prompt and applies it directly to the Agent.

![Custom Agent Configuration & Prompt Generator](1.png)

### 🖐️ Hand-Tracking Auxiliary Control (3D Gesture UI)
To deliver a breakthrough spatial computing experience, the platform integrates MediaPipe Vision tracking. The camera reads the positions of finger joints in real-time, allowing users to interact with the graph canvas absolutely mouse-free:
- ☝️ **Point (Index Finger Extended):** Replaces the mouse to move the virtual cursor. Hold in place (Dwell) for 3 seconds to trigger a **Click**.
- 🖐️ **Open Palm (Fully Extended Hand):** Activates swipe operations. Used to vertically **Scroll** through the options list in the bilateral toolbars.
- 🤏 **Pinch (Thumb and Index Finger Touching):** Grab and **Drag**. This highly intuitive gesture is used to smoothly adjust AI parameter sliders (like the Temperature Slider).

---
## 💻 Tech Stack
- **Frontend Architecture:** React, Vite, Zustand, React Flow, Tailwind CSS, MediaPipe (Computer Vision).
- **Backend Architecture:** Node.js, Express, Socket.io (Real-time Streaming), MySQL, Prisma ORM.
- **AI Core Interop:** LangChain concepts, Ollama Engine (Private/Local LLMs).

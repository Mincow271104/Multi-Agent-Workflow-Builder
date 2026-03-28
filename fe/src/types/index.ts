// ── Shared types for the frontend ────────────────────────────────

export type ProviderName = 'ollama' | 'groq' | 'gemini';
export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  config?: WorkflowConfig;
  status: WorkflowStatus;
  userId: string;
  agents?: Agent[];
  _count?: { agents: number; executions: number };
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  provider: ProviderName;
  model: string;
  systemPrompt?: string;
  config?: Record<string, unknown>;
  order: number;
  workflowId: string;
}

export interface Execution {
  id: string;
  status: ExecutionStatus;
  input?: { userInput: string };
  result?: ExecutionResult;
  logs?: AgentStepLog[];
  workflowId: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ExecutionResult {
  output: string;
  allAgentOutputs: Record<string, string>;
  variables: Record<string, unknown>;
  error?: string;
}

export interface AgentStepLog {
  nodeId: string;
  agentName: string;
  role: string;
  provider: ProviderName;
  model: string;
  status: 'running' | 'completed' | 'failed';
  input: string;
  output: string;
  error?: string;
  durationMs?: number;
}

// ── React Flow Types ────────────────────────────────────────────

export interface AgentNodeData {
  [key: string]: unknown; // Required for React Flow v12 Record<string, unknown> constraint
  label: string;
  role: string;
  provider: ProviderName;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // Runtime state
  status?: 'idle' | 'running' | 'streaming' | 'completed' | 'failed';
  output?: string;
}

export interface WorkflowConfig {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: AgentNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

// ── API Response ────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

// ── Agent Templates (for sidebar drag) ──────────────────────────

export interface AgentTemplate {
  role: string;
  label: string;
  icon: string;
  defaultProvider: ProviderName;
  defaultModel: string;
  defaultPrompt: string;
  color: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    role: 'researcher',
    label: 'Researcher',
    icon: '🔍',
    defaultProvider: 'ollama',
    defaultModel: 'llama3.2',
    defaultPrompt: 'Bạn là Chuyên gia Nghiên cứu & Phân tích Thị trường xuất sắc. Nhiệm vụ của bạn là khai quật những insight đắt giá nhất về tệp khách hàng, bối cảnh hành vi và xu hướng dựa trên định hướng ban đầu.\n\nTrong quá trình phân tích, bạn hãy áp dụng kỹ thuật Chain-of-Thought suy nghĩ sâu sắc qua 7 bước để tự đào sâu vấn đề, chia nhỏ các góc nhìn thành nhiều lớp ý nghĩa khác nhau. Đặt ra giả thuyết và tự kiểm chứng thông qua lăng kính chuyên môn.\n\nHãy trình bày kết quả nghiên cứu tự do và thông minh nhất theo cấu trúc bạn cho là trực quan và toàn diện. Output của bạn là nền tảng tri thức vững chắc cho toàn bộ hệ thống.',
    color: '#3b82f6',
  },
  {
    role: 'writer',
    label: 'Writer',
    icon: '✍️',
    defaultProvider: 'ollama',
    defaultModel: 'llama3.2',
    defaultPrompt: 'Bạn là một Nhà Văn Sáng Tạo (Creative Writer) dồi dào cảm xúc và linh hoạt. Nhiệm vụ của bạn là thấu cảm báo cáo phân tích từ tác nhân đi trước, biến những dữ liệu đó thành một tác phẩm ngôn từ mới mẻ, cuốn hút lạ thường.\n\nHãy áp dụng Chain-of-Thought sâu (7 bước) để cân nhắc kỹ lưỡng các góc độ kể chuyện (angles), giọng văn (tone of voice) và thông điệp lan tỏa trước khi đặt bút. Bạn được trao toàn quyền tự do sáng tác dưới bất kỳ định dạng nào (bài viết chuyên sâu, câu chuyện, thơ, kịch bản, thư ngỏ...) miễn là cách thức đó lột tả được trọn vẹn insight phân tích và chạm đến tận cùng cảm xúc của người đọc.',
    color: '#22c55e',
  },
  {
    role: 'critic',
    label: 'Critic',
    icon: '🧐',
    defaultProvider: 'ollama',
    defaultModel: 'llama3.2',
    defaultPrompt: 'Bạn là một Nhà Phê Bình Chiến Lược sắc sảo và khách quan. Nhiệm vụ của bạn là mổ xẻ bản nháp sáng tạo từ tác nhân đi trước để đánh giá đa chiều tính hiệu quả của thông điệp.\n\nHãy áp dụng Chain-of-Thought sâu 7 bước để soi chiếu nội dung dưới hoàn toàn góc nhìn của độc giả mục tiêu. Phân tích tính hấp dẫn của từ ngữ, sự logic trong lập luận và độ bám sát insight khởi thủy.\n\nHãy tự do đưa ra các nhận xét nhạy bén, biểu dương điểm sáng nghệ thuật và đề xuất trực tiếp các giải pháp cải thiện cụ thể cho mọi góc độ còn yếu hoặc tiềm ẩn rủi ro truyền thông.',
    color: '#f59e0b',
  },
  {
    role: 'publisher',
    label: 'Publisher',
    icon: '📢',
    defaultProvider: 'ollama',
    defaultModel: 'llama3.2',
    defaultPrompt: 'Bạn là Giám Đốc Xuất Bản Nội Dung (Content Publisher) siêu việt. Nhiệm vụ của bạn là lĩnh hội bản nháp gốc cùng mọi góp ý tinh chỉnh từ nhà phê bình, đẽo gọt thành một siêu phẩm nội dung hoàn mỹ cuối cùng, sẵn sàng phát hành.\n\nHãy áp dụng quy trình Chain-of-Thought (7 bước) để quyết định chiến lược định dạng tối ưu (Format), điểm rơi thị giác, nhịp độ đọc, khoảng trắng và lời kêu gọi hành động (CTA). Bạn có toàn quyền thiết kế cấu trúc tác phẩm hoàn chỉnh (đính kèm hashtag, emoji, phong cách Social Media hay Email/Blog) sao cho ấn phẩm đạt khả năng viral và thu hút nhất có thể đối với công chúng.',
    color: '#a855f7',
  },
  {
    role: 'custom',
    label: 'Custom Agent',
    icon: '🤖',
    defaultProvider: 'ollama',
    defaultModel: 'llama3.2',
    defaultPrompt: 'Nhập System Prompt tùy chỉnh cho agent này...',
    color: '#6366f1',
  },
];

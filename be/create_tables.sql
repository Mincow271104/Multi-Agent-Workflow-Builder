CREATE TABLE `users` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `password` VARCHAR(191) NOT NULL,
  `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `users_email_key` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflows` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `config` JSON NULL,
  `status` ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `workflows_userId_idx` (`userId`),
  CONSTRAINT `workflows_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `agents` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `provider` ENUM('OLLAMA', 'GROQ', 'GEMINI') NOT NULL,
  `model` VARCHAR(191) NOT NULL,
  `systemPrompt` TEXT NULL,
  `config` JSON NULL,
  `order` INT NOT NULL DEFAULT 0,
  `workflowId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `agents_workflowId_idx` (`workflowId`),
  CONSTRAINT `agents_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `executions` (
  `id` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `input` JSON NULL,
  `result` JSON NULL,
  `logs` JSON NULL,
  `workflowId` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `executions_workflowId_idx` (`workflowId`),
  INDEX `executions_status_idx` (`status`),
  CONSTRAINT `executions_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

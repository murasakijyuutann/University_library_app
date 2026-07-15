-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PHYSICAL_BOOK', 'THESIS', 'JOURNAL_ARTICLE', 'RESEARCH_REPORT', 'RARE_MATERIAL');

-- CreateEnum
CREATE TYPE "MemberType" AS ENUM ('UNDERGRAD', 'GRADUATE', 'FACULTY', 'STAFF');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'FACULTY', 'LIBRARIAN', 'ADMIN');

-- CreateEnum
CREATE TYPE "DegreeType" AS ENUM ('BACHELOR', 'MASTER', 'PHD');

-- CreateEnum
CREATE TYPE "CopyStatus" AS ENUM ('AVAILABLE', 'ON_LOAN', 'RESERVED', 'LOST');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'RETURNED', 'OVERDUE', 'LOST');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('QUEUED', 'READY_FOR_PICKUP', 'EXPIRED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EMBARGOED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "IllRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'REQUESTED_EXTERNALLY', 'FULFILLED', 'DELIVERED', 'RETURN_DUE', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RESERVATION_READY', 'OVERDUE', 'EMBARGO_LIFTED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "resource" (
    "id" BIGSERIAL NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "department" VARCHAR(150),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_book" (
    "id" BIGINT NOT NULL,
    "isbn" VARCHAR(20),
    "author" VARCHAR(300),
    "publisher" VARCHAR(300),
    "publicationYear" INTEGER,
    "callNumber" VARCHAR(50),

    CONSTRAINT "physical_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thesis" (
    "id" BIGINT NOT NULL,
    "studentMemberId" BIGINT NOT NULL,
    "degreeType" "DegreeType",
    "embargoUntil" DATE,

    CONSTRAINT "thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_article" (
    "id" BIGINT NOT NULL,
    "doi" VARCHAR(150),
    "volume" VARCHAR(20),
    "issue" VARCHAR(20),
    "pageRange" VARCHAR(30),
    "journalId" BIGINT,
    "licenseId" BIGINT,

    CONSTRAINT "journal_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_report" (
    "id" BIGINT NOT NULL,
    "departmentScope" VARCHAR(150),
    "reportYear" INTEGER,

    CONSTRAINT "research_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rare_material" (
    "id" BIGINT NOT NULL,
    "readingRoomOnly" BOOLEAN NOT NULL DEFAULT true,
    "handlingNotes" TEXT,

    CONSTRAINT "rare_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_copy" (
    "id" BIGSERIAL NOT NULL,
    "bookId" BIGINT NOT NULL,
    "barcodeLabel" VARCHAR(50),
    "status" "CopyStatus" NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,
    "shelfLocation" VARCHAR(100),

    CONSTRAINT "resource_copy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" BIGSERIAL NOT NULL,
    "ssoSubjectId" VARCHAR(150) NOT NULL,
    "fullName" VARCHAR(300) NOT NULL,
    "email" VARCHAR(300) NOT NULL,
    "memberType" "MemberType" NOT NULL,
    "faculty" VARCHAR(150),
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_policy" (
    "memberType" "MemberType" NOT NULL,
    "loanDurationDays" INTEGER NOT NULL,
    "maxRenewals" INTEGER NOT NULL,
    "finePerDay" DECIMAL(10,2) NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "maxFine" DECIMAL(10,2),

    CONSTRAINT "loan_policy_pkey" PRIMARY KEY ("memberType")
);

-- CreateTable
CREATE TABLE "fine" (
    "id" BIGSERIAL NOT NULL,
    "memberId" BIGINT NOT NULL,
    "loanId" BIGINT,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" VARCHAR(200),
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan" (
    "id" BIGSERIAL NOT NULL,
    "copyId" BIGINT NOT NULL,
    "memberId" BIGINT NOT NULL,
    "status" "LoanStatus" NOT NULL,
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" BIGSERIAL NOT NULL,
    "resourceId" BIGINT NOT NULL,
    "memberId" BIGINT NOT NULL,
    "queuePosition" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thesis_submission" (
    "id" BIGSERIAL NOT NULL,
    "studentMemberId" BIGINT NOT NULL,
    "supervisorMemberId" BIGINT,
    "degreeType" "DegreeType",
    "submissionStatus" "SubmissionStatus" NOT NULL,
    "embargoUntil" DATE,
    "filePath" VARCHAR(500),
    "submittedAt" TIMESTAMP(3),
    "resourceId" BIGINT,
    "version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "thesis_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "issnPrint" VARCHAR(9),
    "issnElectronic" VARCHAR(9),
    "issnLinking" VARCHAR(9),
    "publisher" VARCHAR(300),

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_license" (
    "id" BIGSERIAL NOT NULL,
    "publisher" VARCHAR(300) NOT NULL,
    "concurrentUserLimit" INTEGER,
    "startsAt" DATE,
    "expiresAt" DATE,
    "version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "journal_license_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_faculty_scope" (
    "licenseId" BIGINT NOT NULL,
    "faculty" VARCHAR(150) NOT NULL,

    CONSTRAINT "license_faculty_scope_pkey" PRIMARY KEY ("licenseId","faculty")
);

-- CreateTable
CREATE TABLE "ill_request" (
    "id" BIGSERIAL NOT NULL,
    "memberId" BIGINT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "author" VARCHAR(300),
    "doiOrIsbn" VARCHAR(150),
    "justification" TEXT,
    "status" "IllRequestStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),
    "returnDueAt" TIMESTAMP(3),

    CONSTRAINT "ill_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entry" (
    "id" BIGSERIAL NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" BIGINT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "actorMemberId" BIGINT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" BIGSERIAL NOT NULL,
    "memberId" BIGINT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_resourceType_idx" ON "resource"("resourceType");

-- CreateIndex
CREATE INDEX "journal_article_journalId_idx" ON "journal_article"("journalId");

-- CreateIndex
CREATE INDEX "journal_article_licenseId_idx" ON "journal_article"("licenseId");

-- CreateIndex
CREATE INDEX "resource_copy_bookId_idx" ON "resource_copy"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "member_ssoSubjectId_key" ON "member"("ssoSubjectId");

-- CreateIndex
CREATE INDEX "fine_memberId_idx" ON "fine"("memberId");

-- CreateIndex
CREATE INDEX "loan_copyId_idx" ON "loan"("copyId");

-- CreateIndex
CREATE INDEX "loan_memberId_idx" ON "loan"("memberId");

-- CreateIndex
CREATE INDEX "reservation_memberId_idx" ON "reservation"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_resourceId_queuePosition_key" ON "reservation"("resourceId", "queuePosition");

-- CreateIndex
CREATE UNIQUE INDEX "thesis_submission_resourceId_key" ON "thesis_submission"("resourceId");

-- CreateIndex
CREATE INDEX "thesis_submission_studentMemberId_idx" ON "thesis_submission"("studentMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_issnLinking_key" ON "journal"("issnLinking");

-- CreateIndex
CREATE INDEX "ill_request_memberId_idx" ON "ill_request"("memberId");

-- CreateIndex
CREATE INDEX "audit_log_entry_entityType_entityId_idx" ON "audit_log_entry"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notification_log_memberId_idx" ON "notification_log"("memberId");

-- AddForeignKey
ALTER TABLE "physical_book" ADD CONSTRAINT "physical_book_id_fkey" FOREIGN KEY ("id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis" ADD CONSTRAINT "thesis_id_fkey" FOREIGN KEY ("id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis" ADD CONSTRAINT "thesis_studentMemberId_fkey" FOREIGN KEY ("studentMemberId") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_article" ADD CONSTRAINT "journal_article_id_fkey" FOREIGN KEY ("id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_article" ADD CONSTRAINT "journal_article_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_article" ADD CONSTRAINT "journal_article_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "journal_license"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report" ADD CONSTRAINT "research_report_id_fkey" FOREIGN KEY ("id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rare_material" ADD CONSTRAINT "rare_material_id_fkey" FOREIGN KEY ("id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_copy" ADD CONSTRAINT "resource_copy_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "physical_book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine" ADD CONSTRAINT "fine_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine" ADD CONSTRAINT "fine_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "resource_copy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis_submission" ADD CONSTRAINT "thesis_submission_studentMemberId_fkey" FOREIGN KEY ("studentMemberId") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis_submission" ADD CONSTRAINT "thesis_submission_supervisorMemberId_fkey" FOREIGN KEY ("supervisorMemberId") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis_submission" ADD CONSTRAINT "thesis_submission_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_faculty_scope" ADD CONSTRAINT "license_faculty_scope_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "journal_license"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ill_request" ADD CONSTRAINT "ill_request_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entry" ADD CONSTRAINT "audit_log_entry_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

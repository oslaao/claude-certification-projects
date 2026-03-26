// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@/generated/prisma";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "prisma", "test.db");
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

const prisma = new PrismaClient({
  datasources: {
    db: { url: TEST_DB_URL },
  },
});

beforeAll(async () => {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

afterEach(async () => {
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

// ---------------------------------------------------------------------------
// User model
// ---------------------------------------------------------------------------

describe("User model", () => {
  it("creates a user with required fields", async () => {
    const user = await prisma.user.create({
      data: { email: "test@example.com", password: "hashed_pw" },
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe("test@example.com");
    expect(user.password).toBe("hashed_pw");
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("enforces unique email constraint", async () => {
    await prisma.user.create({
      data: { email: "dup@example.com", password: "pw" },
    });

    await expect(
      prisma.user.create({
        data: { email: "dup@example.com", password: "pw2" },
      })
    ).rejects.toThrow();
  });

  it("finds a user by email", async () => {
    await prisma.user.create({
      data: { email: "find@example.com", password: "pw" },
    });

    const found = await prisma.user.findUnique({
      where: { email: "find@example.com" },
    });

    expect(found).not.toBeNull();
    expect(found?.email).toBe("find@example.com");
  });

  it("returns null for non-existent email", async () => {
    const found = await prisma.user.findUnique({
      where: { email: "ghost@example.com" },
    });
    expect(found).toBeNull();
  });

  it("updates a user's email", async () => {
    const user = await prisma.user.create({
      data: { email: "old@example.com", password: "pw" },
    });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email: "new@example.com" },
    });

    expect(updated.email).toBe("new@example.com");
  });

  it("deletes a user by id", async () => {
    const user = await prisma.user.create({
      data: { email: "del@example.com", password: "pw" },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found).toBeNull();
  });

  it("selects only specified fields", async () => {
    const user = await prisma.user.create({
      data: { email: "select@example.com", password: "secret" },
    });

    const partial = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, createdAt: true },
    });

    expect(partial).toHaveProperty("id");
    expect(partial).toHaveProperty("email");
    expect(partial).toHaveProperty("createdAt");
    expect(partial).not.toHaveProperty("password");
  });
});

// ---------------------------------------------------------------------------
// Project model
// ---------------------------------------------------------------------------

describe("Project model", () => {
  it("creates a project with default values", async () => {
    const project = await prisma.project.create({
      data: { name: "My Project" },
    });

    expect(project.id).toBeTruthy();
    expect(project.name).toBe("My Project");
    expect(project.userId).toBeNull();
    expect(project.messages).toBe("[]");
    expect(project.data).toBe("{}");
    expect(project.createdAt).toBeInstanceOf(Date);
    expect(project.updatedAt).toBeInstanceOf(Date);
  });

  it("creates a project linked to a user", async () => {
    const user = await prisma.user.create({
      data: { email: "owner@example.com", password: "pw" },
    });

    const project = await prisma.project.create({
      data: { name: "User Project", userId: user.id },
    });

    expect(project.userId).toBe(user.id);
  });

  it("creates a project with custom messages and data", async () => {
    const messages = JSON.stringify([{ role: "user", content: "Hello" }]);
    const data = JSON.stringify({ "/App.jsx": "export default () => null;" });

    const project = await prisma.project.create({
      data: { name: "Rich Project", messages, data },
    });

    expect(project.messages).toBe(messages);
    expect(project.data).toBe(data);
  });

  it("updates a project's name and data", async () => {
    const project = await prisma.project.create({
      data: { name: "Original" },
    });

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { name: "Updated", data: '{"key":"value"}' },
    });

    expect(updated.name).toBe("Updated");
    expect(updated.data).toBe('{"key":"value"}');
  });

  it("deletes a project", async () => {
    const project = await prisma.project.create({
      data: { name: "To Delete" },
    });

    await prisma.project.delete({ where: { id: project.id } });

    const found = await prisma.project.findUnique({
      where: { id: project.id },
    });
    expect(found).toBeNull();
  });

  it("queries projects by userId", async () => {
    const user = await prisma.user.create({
      data: { email: "multi@example.com", password: "pw" },
    });

    await prisma.project.createMany({
      data: [
        { name: "P1", userId: user.id },
        { name: "P2", userId: user.id },
        { name: "P3" },
      ],
    });

    const userProjects = await prisma.project.findMany({
      where: { userId: user.id },
    });

    expect(userProjects).toHaveLength(2);
    expect(userProjects.map((p) => p.name).sort()).toEqual(["P1", "P2"]);
  });
});

// ---------------------------------------------------------------------------
// User → Project relationship
// ---------------------------------------------------------------------------

describe("User-Project relationship", () => {
  it("includes projects when querying a user", async () => {
    const user = await prisma.user.create({
      data: {
        email: "rel@example.com",
        password: "pw",
        projects: {
          create: [{ name: "Alpha" }, { name: "Beta" }],
        },
      },
      include: { projects: true },
    });

    expect(user.projects).toHaveLength(2);
    expect(user.projects.map((p) => p.name).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("includes the user when querying a project", async () => {
    const user = await prisma.user.create({
      data: { email: "incl@example.com", password: "pw" },
    });

    const project = await prisma.project.create({
      data: { name: "Owned", userId: user.id },
      include: { user: true },
    });

    expect(project.user).not.toBeNull();
    expect(project.user?.email).toBe("incl@example.com");
  });

  it("cascade-deletes projects when the user is deleted", async () => {
    const user = await prisma.user.create({
      data: {
        email: "cascade@example.com",
        password: "pw",
        projects: {
          create: [{ name: "Will be deleted" }],
        },
      },
      include: { projects: true },
    });

    const projectId = user.projects[0].id;

    await prisma.user.delete({ where: { id: user.id } });

    const orphan = await prisma.project.findUnique({
      where: { id: projectId },
    });
    expect(orphan).toBeNull();
  });

  it("allows a project with no user (anonymous project)", async () => {
    const project = await prisma.project.create({
      data: { name: "Anonymous" },
      include: { user: true },
    });

    expect(project.userId).toBeNull();
    expect(project.user).toBeNull();
  });
});

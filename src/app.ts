import Fastify, { FastifyInstance } from "fastify";
import { dashboardPage } from "./dashboard.js";
import { OnboardingConfig, OnboardingService } from "./onboarding.js";

interface CreateRequest {
  clientName: string;
  dueAt: string;
  config: OnboardingConfig;
}

interface UpdateRequest {
  patch: Partial<OnboardingConfig>;
  actor: string;
}

export function buildApp(service: OnboardingService): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/", async (_request, reply) => reply.type("text/html").send(dashboardPage()));

  app.post("/api/onboarding", async (request, reply) => {
    try {
      const body = request.body as CreateRequest;
      return reply.code(201).send(service.create(body.clientName, body.dueAt, body.config));
    } catch (error) {
      return reply.code(422).send({ error: (error as Error).message });
    }
  });

  app.get("/api/onboarding/:id", async (request, reply) => {
    try {
      return service.get((request.params as { id: string }).id);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  app.patch("/api/onboarding/:id", async (request, reply) => {
    try {
      const body = request.body as UpdateRequest;
      return service.update((request.params as { id: string }).id, body.patch, body.actor);
    } catch (error) {
      return reply.code(422).send({ error: (error as Error).message });
    }
  });

  app.post("/api/onboarding/:id/handover", async (request, reply) => {
    try {
      const body = request.body as { actor: string };
      return service.handover((request.params as { id: string }).id, body.actor);
    } catch (error) {
      return reply.code(422).send({ error: (error as Error).message });
    }
  });

  app.get("/api/onboarding/sample", async () => service.get("sample"));

  return app;
}

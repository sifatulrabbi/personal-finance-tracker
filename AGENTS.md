## Workflow

- Always automatically prepare a plan before handling a task from the tickets
- If you have to then switch to planning mode automatically
- Use relevant skills both during planning and building
- Leverage sub-agents to get job done in parallel; exploring codebase, updating multiple files with similar updates at once etc
- After a work session and implementing a plan ask the user if they should allow you to commit your work
- Add comments to the code as a part of the codebase itself and also to ensure auto-documentation
- Treat comments as documentations and ensuring you are always updating relevant comments when updating code
- Use both inline comments and JSDoc comments when appropriate
- When additional bugs that are not directly part of the ticket are discovered immediately return back to the user instead of silently handling them

## Planning for Ticket Tasks

- Always brainstorm during planning and ask clarification questions as needed
- Follow proper DI in the backend coding, also stick to procedural coding instead of class based coding
- Follow react best practices when working on the frontend, and use the vercel's frontend skills
- Testability is a must, include unit tests and integration tests in your plan
- Use bun skill to utilize bun's standard lib and built in tool chain
- Include code formatting with `bun run format` as chore after the main work

## Git Committing Your Work

- Always follow conventional git commits when committing code
- Use short forms, feat instead of feature, ref instead of refactor, etc and keep the commit message short
- Add descriptions to the commits mentioning the changes you did in your coding session
- Instead huge code changes under one single commit split them up, follow the conventional commits

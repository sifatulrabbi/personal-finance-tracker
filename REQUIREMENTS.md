# Personal Finance Tracker

A personal finance tracking app for sharing with my household and tracking finances for the entire household.

---

## Finance Tracking Features

- I want the finance tracker to have concept of "Account". Account is the source of the money I'm spending. E.g., credit card, debit card, virtual wallet, cash, etc.
  - I should be able to create a money holding account with name, description, and initial amount.
  - I should also be able to transfer money from one source to the other.
  - These transactions between sources should also reflect in the expense history of mine. I'd let you figure out the best way to prepare this logic, but I think we can have one expense against one account and an income to another account. (We'd exclusively use the terms "income" and "expense" instead of the banking terms credit and debit both in the UI and in the code.)
- Incomes will have origin. Each income would only have one origin. The origin could represent the client from whom I got paid, or the company I work for.
- I can either create a new origin from the app itself or during the income transaction creation I should be able to specify the origin and that would auto create a new origin for me.
- Both the income and expense transaction types will contain a person who initiated the transaction.
- We'll not auto create the person for a transaction. Since this is a household focused finance app of mine I need a settings page that let's me add the household members of mine in the app.
- I should be able to tag them during adding the transactions both income and expense. Also, I should be able to filter transactions based on the persons.
- By default the app would have a person named "Household" this represents shared expense e.g. food expense is often shared thus uses the person household for the expense.
- A transaction entry must require a person, origin, and account. (Income type transactions would increase the amount in the targeted account.)

## Platform and tech stack

- I need an webapp for now so that we can easily use the app from any devices. Mostly from mobiles.
- The app needs to be mobile first but also OK in the desktop mode.
- The preferred tech stack is Next.js, WorkOS, TailwindCSS, chadcn, a well performant and light weight charts library, bun 1.3.11, typescript 6.x.
- The color theme for the application is dark. Use `#0077ff` as the accent color. I have 0 need for a light theme or multi theme support. Use different shades of the primary color to prepare the color palette. DO NOT use gradients in the UI.
- For the database we'll use the SQLite.
- We'll also heavily use bun. It will be the runtime, package manager, and testing suite for us. Also, use bun's sqlite client instead of other sqlite clients. Try using bun as much as possible. Bun is feature rich and would remove a lot of the dependencies that we have e.g. dotenv, feature flags, testing, database adapter, etc.
- Right now I don't think we'd require a dedicated server thus put everything in the next.js's app router and use the next.js's API building strategy to implement all the CRUD logic.
- The app will also be served thru vercel. But you do not have to tackle any deployment work. For now just keep that in mind.

## Auth

- The authentication system needs to be super simple. For now just google login.
- The ideal authentication strategy would be WorkOS. Let the WorkOS handle the entirety of the authentication and authorization.
- We'd manage a very light weight profile entry in our database.
- We'll have our internal user-id and we'll save the WorkOS provided user-in to the user's ID table for look ups.
- We should create index for the WorkOS user id as well for faster look ups.
- We'll have a single sign in page since the sign up is being done by the maintainers of the app.
- Any not already registered (information entered) user will be unable to login to the site even if the WorkOS auth succeeds.

**Related documentations:**

- https://workos.com/docs/integrations/next-auth

## User Management and Household

- The app is exclusively for the household finance tracking and nothing else thus each of the user's we add must belong to a household.
- The user of a household can invite new their households. The invitation mechanism will be a bit different since I don't want to build a full-fledge app for my personal usage.
  - The invitation from a user to add another user basically creates a drafted user profile in the user's table with the email of the invited user.
  - Once done the invited user can login to the app with their Google account and during that time we'll look if the user's email is already in the database.
  - If the user's email not found then we'll basically ignore the user with an error "You must be invited first to sign up to the app".
  - If the user's email is in the DB then we'll check if the user is in drafted mode if so then we'll set the WorkOS's user name to our database and then set the user as not drafted (active).
- Users for now are part of one household only. No multi-household finance tracking.

For the Household creation by default we'll seed my household in the database, actually we'll have two households one for the actual household (aka prod entry) another test household. In the seed data we'll use "mdsifatulislam.rabbi@gmail.com" as the user in the prod (the real) household and "sifatuli.r@gmail.com" in the test household.
However, we need to also ensure that the seed is not causing overwrites to our database. The prod database is sensitive since it's going to contain the actual data of my household.

# Fix Prisma Client Generation Errors

## Issue
TypeScript compilation errors indicate that Prisma client hasn't been regenerated after adding new models to the schema.

## Solution

Run the following commands in the `backend` directory:

```bash
cd backend
npx prisma generate
```

If that doesn't work, try:

```bash
cd backend
npm run prisma:generate
```

Or if you have Prisma CLI installed globally:

```bash
cd backend
prisma generate
```

## What This Does

This command will:
1. Read the Prisma schema (`prisma/schema.prisma`)
2. Generate TypeScript types for all models
3. Create the Prisma client with all model methods

## Models That Need to Be Generated

The following models are defined in the schema but need Prisma client generation:
- `RoleSpec` → `prisma.roleSpec`
- `SkillTaxonomy` → `prisma.skillTaxonomy`
- `EvaluationPolicy` → `prisma.evaluationPolicy`
- `EvaluationBlueprint` → `prisma.evaluationBlueprint`
- `ScoreEvidence` → `prisma.scoreEvidence`
- `CertifiedProfile` → `prisma.certifiedProfile`
- `RankingSnapshot` → `prisma.rankingSnapshot`
- `HiringDecision` → `prisma.hiringDecision`

## Additional Fix Applied

Fixed the `source` property type in `role-specs/dto/role-spec.dto.ts` to use the proper enum type instead of `string`.

## After Regeneration

After running `prisma generate`, all TypeScript errors should be resolved. The Prisma client will have all the necessary methods for the new models.

// mathjs exports every factory function at runtime but types only some of them. These are the
// ones src/money/formula.ts builds its parser from.
import type { FactoryFunction } from "mathjs";

declare module "mathjs" {
  type Factory = FactoryFunction<unknown>;
  export const createAccessorNode: Factory;
  export const createArrayNode: Factory;
  export const createAssignmentNode: Factory;
  export const createBigNumberClass: Factory;
  export const createBignumber: Factory;
  export const createBlockNode: Factory;
  export const createConditionalNode: Factory;
  export const createConstantNode: Factory;
  export const createFunctionAssignmentNode: Factory;
  export const createFunctionNode: Factory;
  export const createIndexNode: Factory;
  export const createIsBounded: Factory;
  export const createNode: Factory;
  export const createNumber: Factory;
  export const createNumeric: Factory;
  export const createObjectNode: Factory;
  export const createOperatorNode: Factory;
  export const createParenthesisNode: Factory;
  export const createParse: Factory;
  export const createRangeNode: Factory;
  export const createRelationalNode: Factory;
  export const createResultSet: Factory;
  export const createSymbolNode: Factory;
  export const createTyped: Factory;
}

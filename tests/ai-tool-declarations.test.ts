import test from 'node:test';
import assert from 'node:assert/strict';
import { toolsFor } from '../backend/src/ai/tools.js';

// Gemini functionDeclarations.parameters uses its documented OpenAPI Schema subset, not arbitrary draft-7.
const supported = new Set(['type', 'format', 'description', 'nullable', 'enum', 'items', 'maxItems', 'minItems', 'properties', 'required', 'minProperties', 'maxProperties', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'example', 'anyOf', 'propertyOrdering', 'default', 'title']);
function check(schema: Record<string, unknown>, path: string) {
  for (const key of Object.keys(schema)) assert.ok(supported.has(key), `${path}.${key} is not a supported Gemini Schema key`);
  if (schema.properties) for (const [key, child] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) check(child, `${path}.${key}`);
  if (schema.items) check(schema.items as Record<string, unknown>, `${path}[]`);
  if (schema.anyOf) (schema.anyOf as Record<string, unknown>[]).forEach((child, index) => check(child, `${path}.anyOf[${index}]`));
}
test('all model declarations serialize using the supported Gemini schema dialect', () => {
  for (const route of ['chat', 'action'] as const) {
    const tools = JSON.parse(JSON.stringify(toolsFor(route))) as ReturnType<typeof toolsFor>;
    assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length);
    for (const tool of tools) check(tool.parameters, `${route}.${tool.name}`);
  }
});
test('chat has only the handoff and read tools; document and record writes require the action route', () => {
  const chat = toolsFor('chat').map(tool => tool.name), action = toolsFor('action').map(tool => tool.name);
  assert.ok(chat.includes('route_to_action'));
  assert.ok(chat.every(name => !name.startsWith('propose_')));
  for (const name of ['propose_add_document', 'propose_edit_document', 'propose_delete_document', 'propose_add_expense', 'propose_update_issuer']) assert.ok(action.includes(name), name);
});

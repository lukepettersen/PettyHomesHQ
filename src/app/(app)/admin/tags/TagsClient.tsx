"use client";

import { ListEditor, type Item } from "../ListEditor";
import { saveTags } from "../actions";

export function TagsClient({ tags }: { tags: Item[] }) {
  return <ListEditor title="Tags" help="Used on people and in smart lists." items={tags} addLabel="New tag" ordered={false} countLabel="people" onSave={(r) => saveTags(r.map(({ id, name }) => ({ id, name })))} />;
}

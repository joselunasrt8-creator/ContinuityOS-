use crate::types::{LineageId, LineageState};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LineageKind {
    Authority,
    Proof,
    Execution,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LineageNode {
    pub id: LineageId,
    pub parent_ids: Vec<LineageId>,
    pub kind: LineageKind,
}

impl LineageNode {
    pub fn authority(id: LineageId, parent_ids: Vec<LineageId>) -> Self {
        Self {
            id,
            parent_ids,
            kind: LineageKind::Authority,
        }
    }

    pub fn proof(id: LineageId, parent_ids: Vec<LineageId>) -> Self {
        Self {
            id,
            parent_ids,
            kind: LineageKind::Proof,
        }
    }

    pub fn execution(id: LineageId, parent_ids: Vec<LineageId>) -> Self {
        Self {
            id,
            parent_ids,
            kind: LineageKind::Execution,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct LineageGraph {
    nodes: BTreeMap<LineageId, LineageNode>,
}

impl LineageGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, node: LineageNode) -> LineageState {
        if self.nodes.contains_key(&node.id) {
            return LineageState::Ambiguous;
        }
        self.nodes.insert(node.id.clone(), node);
        LineageState::Valid
    }

    pub fn classify(&self, id: &LineageId) -> LineageState {
        let Some(node) = self.nodes.get(id) else {
            return LineageState::Null;
        };
        if node
            .parent_ids
            .iter()
            .any(|parent| !self.nodes.contains_key(parent))
        {
            return LineageState::Orphan;
        }
        LineageState::Valid
    }

    pub fn classify_as_validation(&self, id: &LineageId) -> LineageState {
        match self.classify(id) {
            LineageState::Orphan => LineageState::Null,
            state => state,
        }
    }

    pub fn parents(&self, id: &LineageId) -> Option<Vec<&LineageNode>> {
        let node = self.nodes.get(id)?;
        node.parent_ids
            .iter()
            .map(|parent| self.nodes.get(parent))
            .collect()
    }

    pub fn children(&self, id: &LineageId) -> Vec<&LineageNode> {
        self.nodes
            .values()
            .filter(|node| node.parent_ids.contains(id))
            .collect()
    }

    pub fn ancestors(&self, id: &LineageId) -> Option<Vec<&LineageNode>> {
        self.nodes.get(id)?;
        let mut out = Vec::new();
        let mut seen = BTreeSet::new();
        let mut queue = VecDeque::from([id.clone()]);

        while let Some(current) = queue.pop_front() {
            let Some(node) = self.nodes.get(&current) else {
                return None;
            };
            for parent in &node.parent_ids {
                if seen.insert(parent.clone()) {
                    let parent_node = self.nodes.get(parent)?;
                    out.push(parent_node);
                    queue.push_back(parent.clone());
                }
            }
        }
        Some(out)
    }
}

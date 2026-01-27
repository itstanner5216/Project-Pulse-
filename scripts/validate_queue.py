#!/usr/bin/env python3
"""
Queue Validation Script for Project Pulse

This script validates the QUEUE.yml file to ensure it follows the expected schema
and contains well-formed tasks. It performs basic structural checks without requiring
external dependencies beyond the Python standard library.

Usage:
    python scripts/validate_queue.py [path/to/QUEUE.yml]
    
Exit Codes:
    0 - Validation passed
    1 - Validation failed
    2 - File not found or invalid usage
"""

import sys
import yaml
import re
from pathlib import Path
from typing import Dict, List, Any, Set
from datetime import datetime


class QueueValidator:
    """Validates the QUEUE.yml file structure and content."""
    
    REQUIRED_METADATA = ['version', 'created_at', 'repo', 'base_branch', 'description', 'sources']
    REQUIRED_TASK_FIELDS = ['id', 'title', 'description', 'source_refs', 'status', 
                           'acceptance_criteria', 'suggested_commit_message', 'labels', 
                           'owners', 'estimated_hours']
    VALID_STATUSES = {'todo', 'doing', 'done', 'blocked'}
    VALID_PHASES = {'Critical Security Fixes', 'High Priority Data Integrity', 
                   'Resource Management', 'Input Validation', 'Edge Cases and Quality',
                   'Testing Infrastructure', 'Code Quality and Linting', 'Documentation',
                   'CI/CD and Automation'}
    TASK_ID_PATTERN = re.compile(r'^[A-Z]+-\d{3}$')
    COMMIT_MSG_PATTERN = re.compile(r'^(feat|fix|docs|style|refactor|test|chore|sec|perf|ci):\s.+')
    
    def __init__(self, queue_file: Path):
        """Initialize validator with path to QUEUE.yml."""
        self.queue_file = queue_file
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.task_ids: Set[str] = set()
        
    def validate(self) -> bool:
        """Run all validations. Returns True if valid, False otherwise."""
        print(f"🔍 Validating queue file: {self.queue_file}")
        print("=" * 70)
        
        # Load YAML
        try:
            with open(self.queue_file, 'r') as f:
                self.data = yaml.safe_load(f)
        except FileNotFoundError:
            self.errors.append(f"File not found: {self.queue_file}")
            return False
        except yaml.YAMLError as e:
            self.errors.append(f"YAML parsing error: {e}")
            return False
        
        if not isinstance(self.data, dict):
            self.errors.append("Queue file must contain a YAML dictionary")
            return False
        
        # Run validations
        self._validate_metadata()
        self._validate_phases()
        self._validate_summary()
        
        # Print results
        self._print_results()
        
        return len(self.errors) == 0
    
    def _validate_metadata(self):
        """Validate metadata section."""
        if 'metadata' not in self.data:
            self.errors.append("Missing 'metadata' section")
            return
        
        metadata = self.data['metadata']
        
        # Check required fields
        for field in self.REQUIRED_METADATA:
            if field not in metadata:
                self.errors.append(f"Missing metadata field: {field}")
        
        # Validate version format
        if 'version' in metadata:
            version = metadata['version']
            if not re.match(r'^\d+\.\d+\.\d+$', version):
                self.errors.append(f"Invalid version format: {version} (expected X.Y.Z)")
        
        # Validate date format
        if 'created_at' in metadata:
            try:
                datetime.strptime(metadata['created_at'], '%Y-%m-%d')
            except ValueError:
                self.errors.append(f"Invalid date format: {metadata['created_at']} (expected YYYY-MM-DD)")
        
        # Validate sources is a list
        if 'sources' in metadata:
            if not isinstance(metadata['sources'], list):
                self.errors.append("Metadata 'sources' must be a list")
            elif len(metadata['sources']) == 0:
                self.warnings.append("Metadata 'sources' list is empty")
    
    def _validate_phases(self):
        """Validate phases section and all tasks."""
        if 'phases' not in self.data:
            self.errors.append("Missing 'phases' section")
            return
        
        phases = self.data['phases']
        
        if not isinstance(phases, list):
            self.errors.append("'phases' must be a list")
            return
        
        if len(phases) == 0:
            self.errors.append("No phases defined")
            return
        
        for i, phase in enumerate(phases):
            self._validate_phase(phase, i)
    
    def _validate_phase(self, phase: Dict[str, Any], phase_index: int):
        """Validate a single phase."""
        if not isinstance(phase, dict):
            self.errors.append(f"Phase {phase_index} is not a dictionary")
            return
        
        # Check required phase fields
        if 'name' not in phase:
            self.errors.append(f"Phase {phase_index} missing 'name'")
            return
        
        phase_name = phase['name']
        
        if 'description' not in phase:
            self.warnings.append(f"Phase '{phase_name}' missing description")
        
        if 'tasks' not in phase:
            self.errors.append(f"Phase '{phase_name}' missing 'tasks'")
            return
        
        tasks = phase['tasks']
        
        if not isinstance(tasks, list):
            self.errors.append(f"Phase '{phase_name}' tasks must be a list")
            return
        
        if len(tasks) == 0:
            self.warnings.append(f"Phase '{phase_name}' has no tasks")
        
        for task_index, task in enumerate(tasks):
            self._validate_task(task, phase_name, task_index)
    
    def _validate_task(self, task: Dict[str, Any], phase_name: str, task_index: int):
        """Validate a single task."""
        task_ref = f"Phase '{phase_name}', Task {task_index}"
        
        if not isinstance(task, dict):
            self.errors.append(f"{task_ref}: Task is not a dictionary")
            return
        
        # Check required fields
        for field in self.REQUIRED_TASK_FIELDS:
            if field not in task:
                self.errors.append(f"{task_ref}: Missing required field '{field}'")
        
        # Validate task ID
        if 'id' in task:
            task_id = task['id']
            
            if not self.TASK_ID_PATTERN.match(task_id):
                self.errors.append(f"{task_ref}: Invalid ID format '{task_id}' (expected XXX-NNN)")
            
            if task_id in self.task_ids:
                self.errors.append(f"{task_ref}: Duplicate task ID '{task_id}'")
            else:
                self.task_ids.add(task_id)
        
        # Validate title
        if 'title' in task:
            title = task['title']
            if len(title) < 5:
                self.warnings.append(f"{task_ref}: Title too short ('{title}')")
            if len(title) > 100:
                self.warnings.append(f"{task_ref}: Title too long ('{title}')")
        
        # Validate description
        if 'description' in task:
            desc = task['description']
            if isinstance(desc, str) and len(desc.strip()) < 20:
                self.warnings.append(f"{task_ref}: Description too short")
        
        # Validate status
        if 'status' in task:
            status = task['status']
            if status not in self.VALID_STATUSES:
                self.errors.append(f"{task_ref}: Invalid status '{status}' (valid: {self.VALID_STATUSES})")
            
            # Check for blocked_reason if status is blocked
            if status == 'blocked' and 'blocked_reason' not in task:
                self.warnings.append(f"{task_ref}: Status 'blocked' but no 'blocked_reason' provided")
        
        # Validate source_refs
        if 'source_refs' in task:
            refs = task['source_refs']
            if not isinstance(refs, list):
                self.errors.append(f"{task_ref}: 'source_refs' must be a list")
            elif len(refs) == 0:
                self.warnings.append(f"{task_ref}: No source references provided")
        
        # Validate acceptance_criteria
        if 'acceptance_criteria' in task:
            criteria = task['acceptance_criteria']
            if not isinstance(criteria, list):
                self.errors.append(f"{task_ref}: 'acceptance_criteria' must be a list")
            elif len(criteria) < 3:
                self.warnings.append(f"{task_ref}: Only {len(criteria)} acceptance criteria (recommended: 3+)")
        
        # Validate commit message format
        if 'suggested_commit_message' in task:
            msg = task['suggested_commit_message']
            if not self.COMMIT_MSG_PATTERN.match(msg):
                self.warnings.append(f"{task_ref}: Commit message doesn't follow conventional format")
        
        # Validate labels
        if 'labels' in task:
            labels = task['labels']
            if not isinstance(labels, list):
                self.errors.append(f"{task_ref}: 'labels' must be a list")
            elif len(labels) == 0:
                self.warnings.append(f"{task_ref}: No labels provided")
        
        # Validate owners
        if 'owners' in task:
            owners = task['owners']
            if not isinstance(owners, list):
                self.errors.append(f"{task_ref}: 'owners' must be a list")
        
        # Validate estimated_hours
        if 'estimated_hours' in task:
            hours = task['estimated_hours']
            if not isinstance(hours, (int, float)):
                self.errors.append(f"{task_ref}: 'estimated_hours' must be a number")
            elif hours <= 0:
                self.warnings.append(f"{task_ref}: estimated_hours is {hours} (should be > 0)")
            elif hours > 40:
                self.warnings.append(f"{task_ref}: estimated_hours is {hours} (consider breaking down)")
    
    def _validate_summary(self):
        """Validate summary section."""
        if 'summary' not in self.data:
            self.warnings.append("Missing 'summary' section")
            return
        
        summary = self.data['summary']
        
        # Count actual tasks
        actual_counts = {
            'todo': 0,
            'doing': 0,
            'done': 0,
            'blocked': 0
        }
        
        if 'phases' in self.data:
            for phase in self.data['phases']:
                if 'tasks' in phase:
                    for task in phase['tasks']:
                        if 'status' in task:
                            status = task['status']
                            if status in actual_counts:
                                actual_counts[status] += 1
        
        total_actual = sum(actual_counts.values())
        
        # Validate total_tasks
        if 'total_tasks' in summary:
            if summary['total_tasks'] != total_actual:
                self.errors.append(
                    f"Summary total_tasks ({summary['total_tasks']}) doesn't match "
                    f"actual count ({total_actual})"
                )
        
        # Validate status_counts
        if 'status_counts' in summary:
            summary_counts = summary['status_counts']
            for status, count in actual_counts.items():
                if status in summary_counts:
                    if summary_counts[status] != count:
                        self.errors.append(
                            f"Summary {status} count ({summary_counts[status]}) doesn't match "
                            f"actual count ({count})"
                        )
    
    def _print_results(self):
        """Print validation results."""
        print()
        
        if self.errors:
            print("❌ ERRORS:")
            for error in self.errors:
                print(f"   • {error}")
            print()
        
        if self.warnings:
            print("⚠️  WARNINGS:")
            for warning in self.warnings:
                print(f"   • {warning}")
            print()
        
        print("=" * 70)
        print(f"📊 Validation Summary:")
        print(f"   Total Tasks: {len(self.task_ids)}")
        print(f"   Errors: {len(self.errors)}")
        print(f"   Warnings: {len(self.warnings)}")
        print()
        
        if len(self.errors) == 0:
            print("✅ Queue validation PASSED")
            print()
        else:
            print("❌ Queue validation FAILED")
            print()


def main():
    """Main entry point."""
    # Determine queue file path
    if len(sys.argv) > 1:
        queue_file = Path(sys.argv[1])
    else:
        # Default to standard location
        queue_file = Path(__file__).parent.parent / 'agentprompts' / 'QUEUE.yml'
    
    if not queue_file.exists():
        print(f"❌ Error: File not found: {queue_file}")
        print()
        print("Usage: python scripts/validate_queue.py [path/to/QUEUE.yml]")
        return 2
    
    # Run validation
    validator = QueueValidator(queue_file)
    success = validator.validate()
    
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())

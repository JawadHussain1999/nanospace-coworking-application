import { Modal, ModalBody, ModalFooter, Button, Spinner } from 'reactstrap';
import { FiAlertTriangle } from 'react-icons/fi';

export default function DeleteConfirmModal({
  isOpen,
  toggle,
  onConfirm,
  title = 'Are you sure you want to delete this?',
  message = 'This action cannot be undone. Do you really want to proceed?',
  confirmText = 'OK, Delete',
  cancelText = 'Cancel',
  busy = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      toggle={busy ? undefined : toggle}
      centered
      className="delete-confirm-modal"
      size="sm"
    >
      <ModalBody className="text-center p-4">
        <div className="delete-modal-icon-circle mx-auto mb-3">
          <FiAlertTriangle size={30} />
        </div>
        <h5 className="fw-bold mb-2 text-dark">{title}</h5>
        <p className="text-secondary small mb-0">{message}</p>
      </ModalBody>
      <ModalFooter className="border-0 pt-0 px-4 pb-4 d-flex justify-content-center gap-2">
        <Button
          color="light"
          className="btn-soft px-3"
          onClick={toggle}
          disabled={busy}
        >
          {cancelText}
        </Button>
        <Button
          color="danger"
          className="btn-danger-custom px-3 d-flex align-items-center gap-2"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && <Spinner size="sm" />}
          <span>{busy ? 'Deleting...' : confirmText}</span>
        </Button>
      </ModalFooter>
    </Modal>
  );
}

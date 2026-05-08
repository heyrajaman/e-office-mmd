const FileResponseDto = (file) => {
  // --- CONVERT TO INDIAN TIME (IST) ---
  const options = {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };

  let currentHolder = "Pending Assignment";
  let currentHolderId = null;

  if (file.currentHolder) {
    currentHolder = file.currentHolder.full_name;
    currentHolderId = file.current_holder_id;
  }

  let thread = [];
  let lastSender = null;
  let sentByDesignation = null;
  let lastAction = "CREATED";
  let lastRemark = "File Initiated";
  let lastAttachments = [];

  if (
    file.movements &&
    Array.isArray(file.movements) &&
    file.movements.length > 0
  ) {
    // Sort chronologically (oldest to newest) so it reads like a chat
    const sortedMovements = [...file.movements].sort((a, b) => a.id - b.id);

    thread = sortedMovements.map((move) => ({
      id: move.id,
      action: move.action,
      remarks: move.remarks,
      sender: move.sender?.full_name || "System",
      senderDesignation: move.sender?.designation?.name || null,
      senderSignature: move.sender?.signature_url || null,
      date: new Date(move.createdAt).toLocaleString("en-IN", options),
      receiver: move.receiver?.full_name || null,
      receiverDesignation: move.receiver?.designation?.name || null,
      attachments: move.attachments
        ? move.attachments.map((att) => ({
            id: att.id,
            name: att.original_name,
            url: att.file_url,
            type: att.mime_type,
            size: att.file_size,
          }))
        : [],
    }));

    // ✅ FIXED: Using .at(-1) instead of [length - 1]
    const latest = thread.at(-1);
    lastSender = latest?.sender || null;
    sentByDesignation = latest?.senderDesignation || null;
    lastAction = latest?.action || "CREATED";
    lastRemark = latest?.remarks || "File Initiated";
    lastAttachments = latest?.attachments || [];
  } else if (file.latestMovement) {
    // Fallback just in case a query only brings back `latestMovement`
    lastSender = file.latestMovement.sender?.full_name || null;
    sentByDesignation = file.latestMovement.sender?.designation?.name || null;
    lastAction = file.latestMovement.action || "CREATED";
    lastRemark = file.latestMovement.remarks || "File Initiated";
  }

  return {
    id: file.id,
    fileNumber: file.file_number,
    subject: file.subject,
    priority: file.priority,
    status: file.status,
    isVerified: file.is_verified,
    verifiedBy: file.verifier?.full_name || null,
    creatorId: file.created_by,

    // File Details
    verifiedAt: file.verified_at
      ? new Date(file.verified_at).toLocaleString("en-IN", options)
      : null,
    createdAt: new Date(file.createdAt).toLocaleString("en-IN", options),
    updatedAt: new Date(file.updatedAt).toLocaleString("en-IN", options),

    // Departments & Users
    department: file.department?.name || file.department_id,
    createdBy: file.creator?.full_name || file.created_by,
    currentHolder,
    currentHolderId,

    currentPosition: {
      designation: file.currentDesignation?.name || "Unknown",
      department: file.currentDepartment?.name || "Unknown",
    },

    thread,
    lastSender,
    sentByDesignation,
    lastAction,
    lastRemark,
    lastAttachments,
  };
};

export default FileResponseDto;

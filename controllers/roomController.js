import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDatesToList } from '../utils/dateFormatter.js';
import { getFirestore } from '../config/firebase.js';
import { generateUploadKey } from '../utils/keyGenerator.js';

const MENU = 'room';
const TABLE_INFORMATION = `${MENU}_information`;

export const insertRoom = async (req, res) => {
  try {
    const { title, upload_key, type_id, customer_id, owner_id, status, uid } = req.body;

    if (!title || !upload_key || !customer_id || !owner_id || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: title, upload_key, customer_id, owner_id, status, uid',
        required: ['title', 'upload_key', 'customer_id', 'owner_id', 'status', 'uid']
      });
    }

    const db = getDatabase();

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (upload_key, title, type_id, customer_id, owner_id, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const typeIdValue = type_id ? parseInt(type_id) : null;
    const ownerIdValue = parseInt(owner_id);

    const [result] = await db.execute(insertQuery, [
      upload_key?.trim(),
      title?.trim(),
      typeIdValue,
      customer_id?.trim(),
      ownerIdValue,
      status,
      uid
    ]);

    res.json({
      success: true,
      message: 'Room inserted successfully',
      data: {
        id: result.insertId,
        upload_key,
        title,
        type_id: typeIdValue,
        customer_id: customer_id,
        owner_id: ownerIdValue,
        status,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert room',
      message: error.message
    });
  }
};

export const getRoomList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, type_id, customer_id, owner_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();

    let whereClause = 'WHERE r.status != 2';
    let queryParams = [];

    // Status filter
    if (status !== undefined) {
      whereClause += ' AND r.status = ?';
      queryParams.push(parseInt(status));
    }

    // Keyword search (title, owner full_name, owner phone_number, or any member in the room)
    if (keyword && keyword.trim() !== '') {
      whereClause += ` AND (
        r.title LIKE ?
        OR m.full_name LIKE ?
        OR m.phone_number LIKE ?
        OR EXISTS (
          SELECT 1 FROM member_information m2
          WHERE m2.room_id = r.id
          AND m2.status != 2
          AND (m2.full_name LIKE ? OR m2.phone_number LIKE ?)
        )
      )`;
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Type filter
    if (type_id !== undefined && type_id !== '' && parseInt(type_id) !== 0) {
      whereClause += ' AND r.type_id = ?';
      queryParams.push(parseInt(type_id));
    }

    // Customer filter (required)
    whereClause += ' AND r.customer_id = ?';
    queryParams.push(customer_id);

    // Owner filter
    if (owner_id !== undefined && owner_id !== '' && parseInt(owner_id) !== 0) {
      whereClause += ' AND r.owner_id = ?';
      queryParams.push(parseInt(owner_id));
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION} r
      LEFT JOIN member_information m ON r.owner_id = m.id
      ${whereClause}
    `;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT r.id, r.upload_key, r.title, r.type_id, r.customer_id, r.owner_id, r.status,
             r.create_date, r.create_by, r.update_date, r.update_by, r.delete_date, r.delete_by,
             m.id as owner_member_id, m.prefix_name as owner_prefix_name, m.full_name as owner_full_name,
             m.phone_number as owner_phone_number, m.email as owner_email,
             m.user_level as owner_user_level, m.user_type as owner_user_type
      FROM ${TABLE_INFORMATION} r
      LEFT JOIN member_information m ON r.owner_id = m.id
      ${whereClause}
      ORDER BY r.create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates
    const formattedRows = addFormattedDatesToList(rows);

    // Get all room IDs to fetch members
    const roomIds = formattedRows.map(row => row.id);

    let membersByRoom = {};
    if (roomIds.length > 0) {
      const placeholders = roomIds.map(() => '?').join(',');
      const membersQuery = `
        SELECT id, room_id, full_name, phone_number, email, user_level, user_type
        FROM member_information
        WHERE room_id IN (${placeholders}) AND status != 2
        ORDER BY room_id ASC, CASE WHEN user_level = 'owner' THEN 0 ELSE 1 END, id ASC
      `;
      const [members] = await db.execute(membersQuery, roomIds);

      // Group members by room_id
      members.forEach(member => {
        if (!membersByRoom[member.room_id]) {
          membersByRoom[member.room_id] = [];
        }
        const { room_id, ...memberData } = member;
        membersByRoom[member.room_id].push(memberData);
      });
    }

    // Format owner data and members as nested objects
    const finalRows = formattedRows.map(row => {
      const { owner_member_id, owner_prefix_name, owner_full_name, owner_phone_number, owner_email, owner_user_level, owner_user_type, ...roomData } = row;

      return {
        ...roomData,
        owner: owner_member_id ? {
          id: owner_member_id,
          prefix_name: owner_prefix_name,
          full_name: owner_full_name,
          phone_number: owner_phone_number,
          email: owner_email,
          user_level: owner_user_level,
          user_type: owner_user_type
        } : null,
        members: membersByRoom[roomData.id] || []
      };
    });

    res.json({
      success: true,
      data: finalRows,
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total: total,
        total_pages: Math.ceil(total / limitNum),
        has_next: pageNum * limitNum < total,
        has_prev: pageNum > 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('List room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rooms',
      message: error.message
    });
  }
};

export const getSummaryData = async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const db = getDatabase();

    // Get current month range (start and end of month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Card 1: ห้องที่มีผู้อยู่อาศัย (Total rooms with residents)
    const roomCountQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status != 2
    `;
    const [roomCountResult] = await db.execute(roomCountQuery, [customer_id]);
    const totalRooms = roomCountResult[0].total;

    // Card 1: ห้องที่สร้างในเดือนนี้
    const roomThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status != 2
        AND create_date >= ? AND create_date <= ?
    `;
    const [roomThisMonthResult] = await db.execute(roomThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const roomsThisMonth = roomThisMonthResult[0].total;

    // Card 2: ผู้อยู่อาศัยทั้งหมด (Total members)
    const memberCountQuery = `
      SELECT COUNT(*) as total
      FROM member_information
      WHERE customer_id = ? AND status != 2
    `;
    const [memberCountResult] = await db.execute(memberCountQuery, [customer_id]);
    const totalMembers = memberCountResult[0].total;

    // Card 2: สมาชิกที่สร้างในเดือนนี้
    const memberThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM member_information
      WHERE customer_id = ? AND status != 2
        AND create_date >= ? AND create_date <= ?
    `;
    const [memberThisMonthResult] = await db.execute(memberThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const membersThisMonth = memberThisMonthResult[0].total;

    // Card 3: เจ้าของห้อง (Owners)
    const ownerCountQuery = `
      SELECT COUNT(*) as total
      FROM member_information
      WHERE customer_id = ? AND status != 2 AND user_level = 'owner'
    `;
    const [ownerCountResult] = await db.execute(ownerCountQuery, [customer_id]);
    const totalOwners = ownerCountResult[0].total;

    // Card 3: เจ้าของที่สร้างในเดือนนี้
    const ownerThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM member_information
      WHERE customer_id = ? AND status != 2 AND user_level = 'owner'
        AND create_date >= ? AND create_date <= ?
    `;
    const [ownerThisMonthResult] = await db.execute(ownerThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const ownersThisMonth = ownerThisMonthResult[0].total;

    // Card 4: ผู้เช่า (Renters)
    const renterCountQuery = `
      SELECT COUNT(*) as total
      FROM member_information
      WHERE customer_id = ? AND status != 2 AND user_level != 'owner'
    `;
    const [renterCountResult] = await db.execute(renterCountQuery, [customer_id]);
    const totalRenters = renterCountResult[0].total;

    // Card 4: ผู้เช่าที่สร้างในเดือนนี้
    const renterThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM member_information
      WHERE customer_id = ? AND status != 2 AND user_level != 'owner'
        AND create_date >= ? AND create_date <= ?
    `;
    const [renterThisMonthResult] = await db.execute(renterThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const rentersThisMonth = renterThisMonthResult[0].total;

    // Card 5: สมาชิกครอบครัว (Family members - ใช้แบบเดียวกับ card 2 ก่อน)
    const familyMembersCount = totalMembers;
    const familyMembersThisMonth = membersThisMonth;

    res.json({
      success: true,
      data: {
        total_rooms: {
          count: totalRooms,
          change: roomsThisMonth,
          change_text: roomsThisMonth > 0 ? `+${roomsThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        total_members: {
          count: totalMembers,
          change: membersThisMonth,
          change_text: membersThisMonth > 0 ? `+${membersThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        total_owners: {
          count: totalOwners,
          change: ownersThisMonth,
          change_text: ownersThisMonth > 0 ? `+${ownersThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        total_renters: {
          count: totalRenters,
          change: rentersThisMonth,
          change_text: rentersThisMonth > 0 ? `+${rentersThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        family_members: {
          count: familyMembersCount,
          change: familyMembersThisMonth,
          change_text: familyMembersThisMonth > 0 ? `+${familyMembersThisMonth} เดือนนี้` : `0 เดือนนี้`
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get room summary data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch room summary data',
      message: error.message
    });
  }
};

/**
 * Sync room and member data from Firebase Firestore
 * POST /api/room/sync_from_firebase
 * Body: { customer_id, uid }
 */
export const syncFromFirebase = async (req, res) => {
  try {
    const { customer_id, uid } = req.body;

    if (!customer_id || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: customer_id, uid',
        required: ['customer_id', 'uid']
      });
    }

    const db = getDatabase();
    const firestore = getFirestore();

    logger.info(`Starting Firebase sync for customer_id: ${customer_id}`);

    // Step 1: Query customer from Firestore to get customer.name
    const customersRef = firestore.collection('customer');
    const customerSnapshot = await customersRef.where('customer_code', '==', customer_id).limit(1).get();

    if (customerSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        message: 'ไม่พบข้อมูล customer ใน Firebase'
      });
    }

    const customerDoc = customerSnapshot.docs[0];
    const customerName = customerDoc.data().name;

    logger.info(`Found customer: ${customerName}`);

    // Step 2: Query site_members from Firebase
    const siteMembersPath = `corporation/${customerName}/site/${customerName}/site_members`;
    const siteMembersRef = firestore.collection(siteMembersPath);
    const siteMembersSnapshot = await siteMembersRef.where('user_type', '==', 'MEMBER').get();

    if (siteMembersSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'No members found',
        message: 'ไม่พบข้อมูลสมาชิกใน Firebase'
      });
    }

    logger.info(`Found ${siteMembersSnapshot.size} members`);

    // Step 3: Process members and group by house_no
    const membersByHouse = {};
    const userRefs = [];

    for (const doc of siteMembersSnapshot.docs) {
      const memberData = doc.data();

      // Calculate house_no
      let houseNo = '';
      if (memberData.house_no && memberData.house_no.trim() !== '') {
        houseNo = `${memberData.prefix_address}/${memberData.house_no}`;
      } else {
        houseNo = memberData.prefix_address || '';
      }

      if (!houseNo) {
        logger.warn(`Skipping member ${doc.id} - no house number`);
        continue;
      }

      // Collect userRef for batch query
      if (memberData.userRef) {
        userRefs.push(memberData.userRef.path);
      }

      // Group by house_no
      if (!membersByHouse[houseNo]) {
        membersByHouse[houseNo] = [];
      }

      membersByHouse[houseNo].push({
        doc_id: doc.id,
        doc_path: doc.ref.path,
        ...memberData,
        calculated_house_no: houseNo
      });
    }

    // Step 4: Query all kconnect_users in batch
    const userDataMap = {};
    const uniqueUserPaths = [...new Set(userRefs)];

    for (const userPath of uniqueUserPaths) {
      try {
        const userDoc = await firestore.doc(userPath).get();
        if (userDoc.exists) {
          userDataMap[userPath] = userDoc.data();
        }
      } catch (error) {
        logger.warn(`Failed to fetch user: ${userPath}`, error);
      }
    }

    logger.info(`Fetched ${Object.keys(userDataMap).length} user profiles`);

    // Step 5: Sync data to MySQL
    let roomsInserted = 0;
    let roomsUpdated = 0;
    let membersInserted = 0;
    let membersUpdated = 0;

    for (const [houseNo, members] of Object.entries(membersByHouse)) {
      // Find owner
      const ownerMember = members.find(m => m.user_level === 'owner') || members[0];

      // Step 5.1: Insert/Update room_information
      const checkRoomQuery = `
        SELECT id FROM ${TABLE_INFORMATION}
        WHERE title = ? AND customer_id = ? AND status != 2
        LIMIT 1
      `;
      const [existingRoom] = await db.execute(checkRoomQuery, [houseNo, customer_id]);

      let roomId;
      if (existingRoom.length > 0) {
        roomId = existingRoom[0].id;
        roomsUpdated++;
        logger.debug(`Room exists: ${houseNo} (ID: ${roomId})`);
      } else {
        // Always set status = 1 (hardcoded, not from Firebase member data)
        const roomStatus = 1;

        const insertRoomQuery = `
          INSERT INTO ${TABLE_INFORMATION} (upload_key, title, type_id, customer_id, status, create_by)
          VALUES (?, ?, NULL, ?, ?, ?)
        `;
        const [roomResult] = await db.execute(insertRoomQuery, [
          generateUploadKey(),
          houseNo,
          customer_id,
          roomStatus,
          uid
        ]);
        roomId = roomResult.insertId;
        roomsInserted++;
        logger.debug(`Room inserted: ${houseNo} (ID: ${roomId})`);
      }

      // Step 5.2: Process each member
      let ownerId = null;

      for (const member of members) {
        const userRefPath = member.userRef?.path;
        const userData = userDataMap[userRefPath] || {};

        const prefixName = userData.prefixName || '';
        const email = userData.display_email || userData.email || '';

        // Check if member exists
        const memberRef = member.doc_path;
        const checkMemberQuery = `
          SELECT id FROM member_information
          WHERE member_ref = ? AND status != 2
          LIMIT 1
        `;
        const [existingMember] = await db.execute(checkMemberQuery, [memberRef]);

        let memberId;
        if (existingMember.length > 0) {
          // Update existing member
          memberId = existingMember[0].id;
          // Get status from Firebase member data (default to 1)
          const memberStatus = member.status !== undefined ? parseInt(member.status) : 1;

          const updateMemberQuery = `
            UPDATE member_information
            SET prefix_name = ?, full_name = ?, phone_number = ?, email = ?, house_no = ?, user_level = ?, room_id = ?, status = ?
            WHERE id = ?
          `;
          await db.execute(updateMemberQuery, [
            prefixName,
            member.fullName || '',
            member.phone_number || '',
            email,
            member.calculated_house_no,
            member.user_level || 'resident',
            roomId,
            memberStatus,
            memberId
          ]);
          membersUpdated++;
          logger.debug(`Member updated: ${member.fullName} (ID: ${memberId})`);
        } else {
          // Insert new member
          // Get status from Firebase member data (default to 1)
          const memberStatus = member.status !== undefined ? parseInt(member.status) : 1;

          // For enter_date: convert Firebase timestamp or use NOW()
          const enterDateValue = member.create_date?._seconds
            ? `FROM_UNIXTIME(${member.create_date._seconds})`
            : 'NOW()';

          const insertMemberQuery = `
            INSERT INTO member_information
            (upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status, create_by)
            VALUES (?, ?, ?, ?, ?, ${enterDateValue}, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const [memberResult] = await db.execute(insertMemberQuery, [
            generateUploadKey(),
            prefixName,
            member.fullName || '',
            member.phone_number || '',
            email,
            // enterDate removed - using FROM_UNIXTIME() or NOW() directly in query
            roomId,
            member.calculated_house_no,
            member.user_level || 'resident',
            member.user_type || 'MEMBER',
            userRefPath || '',
            memberRef,
            customer_id,
            memberStatus,
            uid
          ]);
          memberId = memberResult.insertId;
          membersInserted++;
          logger.debug(`Member inserted: ${member.fullName} (ID: ${memberId})`);
        }

        // Track owner_id
        if (member.user_level === 'owner') {
          ownerId = memberId;
        }
      }

      // Step 5.3: Update room with owner_id
      if (ownerId) {
        const updateRoomOwnerQuery = `
          UPDATE ${TABLE_INFORMATION}
          SET owner_id = ?, update_date = NOW(), update_by = ?
          WHERE id = ?
        `;
        await db.execute(updateRoomOwnerQuery, [ownerId, uid, roomId]);
        logger.debug(`Room owner_id updated: ${roomId} -> ${ownerId}`);
      }
    }

    // Step 6: Sync bank information from niti_data/niti_bank_list
    let banksInserted = 0;
    let banksUpdated = 0;

    try {
      // Check if niti_data exists
      const nitiDataPath = `corporation/${customerName}/site/${customerName}/niti_data`;
      const nitiDataSnapshot = await firestore.collection(nitiDataPath).limit(1).get();

      if (!nitiDataSnapshot.empty) {
        logger.info('Found niti_data collection, checking for bank list...');

        // Get first doc from niti_data
        const nitiDataDoc = nitiDataSnapshot.docs[0];

        // Query niti_bank_list subcollection
        const bankListRef = firestore.collection(`${nitiDataPath}/${nitiDataDoc.id}/niti_bank_list`);
        const bankListSnapshot = await bankListRef.get();

        if (!bankListSnapshot.empty) {
          logger.info(`Found ${bankListSnapshot.size} banks in niti_bank_list`);

          for (const bankDoc of bankListSnapshot.docs) {
            const bankData = bankDoc.data();

            // Extract bank data from Firebase
            const bankAccount = bankData.bank_account || '';
            const bankId = bankData.bank_id ? parseInt(bankData.bank_id) : null;
            const bankNo = bankData.bank_no || '';
            const type = bankData.type || '';
            const createDate = bankData.create_date;

            // Skip if bank_no is empty
            if (!bankNo || bankNo.trim() === '') {
              logger.warn(`Skipping bank with empty bank_no`);
              continue;
            }

            // Check if bank exists (by bank_no and customer_id)
            const checkBankQuery = `
              SELECT id FROM bank_information
              WHERE bank_no = ? AND customer_id = ? AND status != 2
              LIMIT 1
            `;
            const [existingBank] = await db.execute(checkBankQuery, [bankNo, customer_id]);

            if (existingBank.length > 0) {
              // Update existing bank
              const bankIdDb = existingBank[0].id;

              const updateBankQuery = `
                UPDATE bank_information
                SET bank_account = ?, bank_id = ?, type = ?, update_date = NOW(), update_by = ?
                WHERE id = ?
              `;
              await db.execute(updateBankQuery, [
                bankAccount,
                bankId,
                type,
                uid,
                bankIdDb
              ]);
              banksUpdated++;
              logger.debug(`Bank updated: ${bankNo} (ID: ${bankIdDb})`);
            } else {
              // Insert new bank
              // For create_date: convert Firebase timestamp or use NOW()
              const createDateValue = createDate?._seconds
                ? `FROM_UNIXTIME(${createDate._seconds})`
                : 'NOW()';

              const insertBankQuery = `
                INSERT INTO bank_information
                (upload_key, bank_account, bank_id, bank_no, type, status, customer_id, create_date, create_by)
                VALUES (?, ?, ?, ?, ?, 1, ?, ${createDateValue}, ?)
              `;

              const [bankResult] = await db.execute(insertBankQuery, [
                generateUploadKey(),
                bankAccount,
                bankId,
                bankNo,
                type,
                customer_id,
                uid
              ]);
              banksInserted++;
              logger.debug(`Bank inserted: ${bankNo} (ID: ${bankResult.insertId})`);
            }
          }
        } else {
          logger.info('No banks found in niti_bank_list');
        }
      } else {
        logger.info('No niti_data collection found, skipping bank sync');
      }
    } catch (bankError) {
      logger.error('Error syncing banks from Firebase:', bankError);
      // Don't fail the whole sync, just log the error
    }

    logger.info(`Sync completed: Rooms (${roomsInserted} inserted, ${roomsUpdated} updated), Members (${membersInserted} inserted, ${membersUpdated} updated), Banks (${banksInserted} inserted, ${banksUpdated} updated)`);

    res.json({
      success: true,
      message: 'ซิงค์ข้อมูลจาก Firebase สำเร็จ',
      data: {
        rooms: {
          inserted: roomsInserted,
          updated: roomsUpdated,
          total: roomsInserted + roomsUpdated
        },
        members: {
          inserted: membersInserted,
          updated: membersUpdated,
          total: membersInserted + membersUpdated
        },
        banks: {
          inserted: banksInserted,
          updated: banksUpdated,
          total: banksInserted + banksUpdated
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Sync from Firebase error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync from Firebase',
      message: 'เกิดข้อผิดพลาดในการซิงค์ข้อมูล',
      details: error.message
    });
  }
};
